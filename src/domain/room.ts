import type { Piece2D } from './customShape';

/**
 * Raumkontur mit Hindernissen (Säulen, Türen, Notausgänge). Die Kontur ist rein optional: alte
 * Pläne ohne `room` bleiben unverändert. Hindernisse und die Fläche außerhalb des Raums werden
 * über `roomBlockers` wie belegte Stücke behandelt — die bestehenden Kollisionsfunktionen
 * (fitsAt, findFreePosition, checkGroupMove) bleiben dafür unverändert.
 */
export type ObstacleKind = 'saeule' | 'tuer' | 'notausgang';

export const OBSTACLE_LABELS: Record<ObstacleKind, string> = {
  saeule: 'Säule',
  tuer: 'Tür (Schwenkbereich)',
  notausgang: 'Notausgang – Freifläche',
};

const OBSTACLE_KINDS: readonly ObstacleKind[] = ['saeule', 'tuer', 'notausgang'];

export interface RoomObstacle {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  d: number;
  label?: string;
}

/** Raum in denselben Metern wie der Plan (Ursprung oben links). */
export interface RoomPlan {
  widthM: number;
  depthM: number;
  obstacles: RoomObstacle[];
}

/** Präfix der IDs von Raum-Blockern — damit sie von echten Stücken unterscheidbar bleiben. */
export const ROOM_BLOCKER_PREFIX = 'room:';

const EPS = 1e-6;
/** Breite/Tiefe der Außenflächen, die den Raum nach rechts und hinten abschließen. */
const OUTSIDE_EXTENT_M = 1000;
const MAX_ROOM_M = 500;
const MAX_LABEL_LENGTH = 80;

function overlaps(a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.d - EPS && b.y < a.y + a.d - EPS;
}

/**
 * Hindernisse und die Fläche außerhalb des Raums als belegte Stücke — für fitsAt/findFreePosition/checkGroupMove.
 * Links und vorne begrenzt schon x,y ≥ 0; daher kommen nur die Flächen rechts und hinten dazu.
 * Ohne Raum → [].
 *
 * Hinweis: findFreePosition liefert in einem vollen Raum als Sicherheitsnetz eine Lage rechts neben
 * allem (also hinter dem rechten Blocker). Aufrufer müssen das Ergebnis mit rectInsideRoom prüfen (siehe T28).
 */
export function roomBlockers(room: RoomPlan | undefined): Piece2D[] {
  if (!room) return [];
  const blockers: Piece2D[] = room.obstacles.map((o) => ({
    id: `${ROOM_BLOCKER_PREFIX}${o.id}`,
    x: o.x,
    y: o.y,
    w: o.w,
    d: o.d,
  }));
  blockers.push(
    { id: `${ROOM_BLOCKER_PREFIX}__rechts`, x: room.widthM, y: 0, w: OUTSIDE_EXTENT_M, d: room.depthM + OUTSIDE_EXTENT_M },
    { id: `${ROOM_BLOCKER_PREFIX}__hinten`, x: 0, y: room.depthM, w: room.widthM, d: OUTSIDE_EXTENT_M },
  );
  return blockers;
}

/** true, wenn die ID zu einem Raum-Blocker gehört (siehe roomBlockers). */
export function isRoomBlockerId(id: string): boolean {
  return id.startsWith(ROOM_BLOCKER_PREFIX);
}

/** true, wenn das Rechteck vollständig im Raum liegt (ohne Raum immer true). */
export function rectInsideRoom(r: { x: number; y: number; w: number; d: number }, room: RoomPlan | undefined): boolean {
  if (!room) return true;
  return r.x >= -EPS && r.y >= -EPS && r.x + r.w <= room.widthM + EPS && r.y + r.d <= room.depthM + EPS;
}

/** Hindernisse, die sich mit mindestens einem der Stücke überschneiden. */
export function obstaclesOverlapping(pieces: Piece2D[], room: RoomPlan | undefined): RoomObstacle[] {
  if (!room) return [];
  return room.obstacles.filter((o) => pieces.some((p) => overlaps(o, p)));
}

/** Stücke, die nicht vollständig im Raum liegen (ohne Raum → []). */
export function piecesOutsideRoom(pieces: Piece2D[], room: RoomPlan | undefined): Piece2D[] {
  if (!room) return [];
  return pieces.filter((p) => !rectInsideRoom(p, room));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidDimension(v: unknown): v is number {
  return isFiniteNumber(v) && v > 0 && v <= MAX_ROOM_M;
}

/**
 * Bereinigt eine Raumkontur aus einer Datei. Ungültige Raummaße ergeben `room: undefined`.
 * Hindernisse werden einzeln geprüft: unbekannte Art, nicht-endliche Zahlen, w/d ≤ 0,
 * negative Position, leere oder doppelte ID werden verworfen (nicht umbenannt) und zählen als `dropped`.
 * Ein ungültiges Label fällt einzeln weg, das Hindernis bleibt.
 */
export function sanitizeRoom(raw: unknown): { room: RoomPlan | undefined; dropped: number } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { room: undefined, dropped: 0 };
  const v = raw as Record<string, unknown>;
  if (!isValidDimension(v.widthM) || !isValidDimension(v.depthM)) return { room: undefined, dropped: 0 };

  const rawObstacles = Array.isArray(v.obstacles) ? v.obstacles : [];
  const seenIds = new Set<string>();
  const obstacles: RoomObstacle[] = [];
  let dropped = 0;

  for (const item of rawObstacles) {
    if (typeof item !== 'object' || item === null) {
      dropped++;
      continue;
    }
    const o = item as Record<string, unknown>;
    const valid =
      typeof o.id === 'string' &&
      o.id !== '' &&
      !seenIds.has(o.id) &&
      typeof o.kind === 'string' &&
      OBSTACLE_KINDS.includes(o.kind as ObstacleKind) &&
      isFiniteNumber(o.x) &&
      isFiniteNumber(o.y) &&
      isFiniteNumber(o.w) &&
      isFiniteNumber(o.d) &&
      o.w > 0 &&
      o.d > 0 &&
      o.x >= 0 &&
      o.y >= 0;
    if (!valid) {
      dropped++;
      continue;
    }
    const id = o.id as string;
    seenIds.add(id);
    const obstacle: RoomObstacle = {
      id,
      kind: o.kind as ObstacleKind,
      x: o.x as number,
      y: o.y as number,
      w: o.w as number,
      d: o.d as number,
    };
    if (typeof o.label === 'string' && o.label.length <= MAX_LABEL_LENGTH) {
      obstacle.label = o.label;
    }
    obstacles.push(obstacle);
  }

  return { room: { widthM: v.widthM, depthM: v.depthM, obstacles }, dropped };
}

/** Kleinste freie Hindernis-ID im Format 'ob-1', 'ob-2' … (eindeutig gegen bestehende IDs). */
export function nextObstacleId(room: RoomPlan): string {
  const used = new Set(room.obstacles.map((o) => o.id));
  let n = 1;
  while (used.has(`ob-${n}`)) n++;
  return `ob-${n}`;
}
