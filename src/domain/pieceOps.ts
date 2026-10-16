import { findFreePosition, fitsAllAt, fitsAt, makePieceId, mirrorPieceInPlace, rotatePieceInPlace, type FilledPiece, type PlacementOptions, type Piece2D } from './customShape';
import { isCatalogRect, isCatalogTriangleBox, QUARTER_CIRCLE_RADIUS_M } from './panels';
import type { PieceShape, TriangleCorner } from './types';

/**
 * Appends filled pieces (without IDs) to the pieces array, assigning fresh IDs.
 * Returns a new array. Returns the SAME array reference if nothing changed.
 */
export function addFilledPieces(pieces: Piece2D[], filled: FilledPiece[]): Piece2D[] {
  if (filled.length === 0) {
    return pieces;
  }
  return [...pieces, ...filled.map((p) => ({ ...p, id: makePieceId() }))];
}

/**
 * Removes a piece by ID from the array.
 * Returns a new array. Returns the SAME array reference if the ID wasn't found.
 */
export function removePieceById(pieces: Piece2D[], id: string): Piece2D[] {
  const found = pieces.some((p) => p.id === id);
  if (!found) {
    return pieces;
  }
  return pieces.filter((p) => p.id !== id);
}

/**
 * Moves a piece to a new (x, y) position.
 * Returns a new array. Returns the SAME array reference if the ID wasn't found
 * or if the piece is already at (x, y).
 */
export function movePieceTo(pieces: Piece2D[], id: string, x: number, y: number): Piece2D[] {
  const target = pieces.find((p) => p.id === id);
  if (!target || (target.x === x && target.y === y)) {
    return pieces;
  }
  return pieces.map((p) => (p.id === id ? { ...p, x, y } : p));
}

/**
 * Moves all pieces whose IDs are in `ids` by (dx, dy) in one step.
 * Positions are rounded to 3 decimals to avoid floating-point drift.
 * Returns a new array. Returns the SAME array reference if dx and dy are both 0
 * or if none of the IDs was found.
 */
export function movePiecesBy(pieces: Piece2D[], ids: readonly string[], dx: number, dy: number): Piece2D[] {
  if (dx === 0 && dy === 0) return pieces;
  const set = new Set(ids);
  if (!pieces.some((p) => set.has(p.id))) return pieces;
  return pieces.map((p) => (set.has(p.id) ? { ...p, x: r3(p.x + dx), y: r3(p.y + dy) } : p));
}

export type GroupMoveCheck = 'ok' | 'out-of-bounds' | 'collision';

/**
 * Prüft, ob die Stücke `ids` gemeinsam um (dx, dy) verschoben werden können. Ausgewählte Stücke stoßen nicht aneinander.
 * `blockers` sind feste Stücke (Raum-Hindernisse, andere Ebene): sie kollidieren, landen aber nie im Ergebnis.
 */
export function checkGroupMove(pieces: Piece2D[], ids: readonly string[], dx: number, dy: number, blockers: readonly Piece2D[] = []): GroupMoveCheck {
  const set = new Set(ids);
  const moving = pieces.filter((p) => set.has(p.id));
  if (moving.length === 0) return 'ok';
  if (moving.some((p) => p.x + dx < -1e-6 || p.y + dy < -1e-6)) return 'out-of-bounds';
  const others = [...pieces.filter((p) => !set.has(p.id)), ...blockers];
  return moving.every((p) => fitsAt(others, p.x + dx, p.y + dy, p.w, p.d)) ? 'ok' : 'collision';
}

/**
 * Versatz, um die Auswahl mit der linken oberen Ecke ihrer Bounding-Box auf (targetX, targetY) zu setzen (aufs Raster gerundet, nicht negativ), samt Prüfergebnis.
 * Dient dem Verschieben ohne Ziehen (Ziel antippen): der Versatz ist relativ zur Bounding-Box der Auswahl.
 * `blockers` werden wie bei checkGroupMove geprüft, landen aber nie im Ergebnis.
 */
export function moveGroupTo(pieces: Piece2D[], ids: readonly string[], targetX: number, targetY: number, gridM = 0.5, blockers: readonly Piece2D[] = []): { dx: number; dy: number; result: GroupMoveCheck } {
  const set = new Set(ids);
  const moving = pieces.filter((p) => set.has(p.id));
  if (moving.length === 0) return { dx: 0, dy: 0, result: 'ok' };
  const minX = Math.min(...moving.map((p) => p.x));
  const minY = Math.min(...moving.map((p) => p.y));
  const tx = Math.max(0, Math.round(targetX / gridM) * gridM);
  const ty = Math.max(0, Math.round(targetY / gridM) * gridM);
  const dx = r3(tx - minX);
  const dy = r3(ty - minY);
  return { dx, dy, result: checkGroupMove(pieces, ids, dx, dy, blockers) };
}

/**
 * Removes all pieces whose IDs are in `ids` in one step.
 * Returns a new array. Returns the SAME array reference if none of the IDs was found.
 */
export function removePiecesByIds(pieces: Piece2D[], ids: readonly string[]): Piece2D[] {
  const set = new Set(ids);
  if (!pieces.some((p) => set.has(p.id))) return pieces;
  return pieces.filter((p) => !set.has(p.id));
}

/**
 * Kopie der Stücke `ids` (ohne id), als Block um k × Blockbreite nach rechts versetzt (k = 1..maxSteps, erste freie Stelle).
 * `blockers` werden ausgewichen (z. B. Raum-Hindernisse); sie landen nie im Ergebnis.
 * null, wenn ids leer sind oder nichts frei ist.
 */
export function duplicateWithOffset(pieces: Piece2D[], ids: readonly string[], maxSteps = 20, blockers: readonly Piece2D[] = []): FilledPiece[] | null {
  const set = new Set(ids);
  const sel = pieces.filter((p) => set.has(p.id));
  if (sel.length === 0) return null;
  const minX = Math.min(...sel.map((p) => p.x));
  const maxX = Math.max(...sel.map((p) => p.x + p.w));
  const bw = maxX - minX;
  for (let k = 1; k <= maxSteps; k++) {
    const dx = k * bw;
    const copy: FilledPiece[] = sel.map((p) => ({
      x: r3(p.x + dx),
      y: p.y,
      w: p.w,
      d: p.d,
      ...(p.corner !== undefined ? { corner: p.corner } : {}),
      ...(p.shape !== undefined ? { shape: p.shape } : {}),
    }));
    if (fitsAllAt([...pieces, ...blockers], copy)) return copy;
  }
  return null;
}

/** Rounds to 3 decimal places (mm precision for meter values). */
function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Rotates a piece by ID in place (swaps w/d for rectangles, advances corner for triangles).
 * Returns a new array. Returns the SAME array reference if the ID wasn't found.
 */
export function rotatePieceById(pieces: Piece2D[], id: string): Piece2D[] {
  const found = pieces.some((p) => p.id === id);
  if (!found) {
    return pieces;
  }
  return pieces.map((p) => (p.id === id ? rotatePieceInPlace(p) : p));
}

/**
 * Mirrors a piece by ID in place (mirrors diagonal for non-square cornered pieces).
 * Returns a new array. Returns the SAME array reference if the ID wasn't found.
 */
export function mirrorPieceById(pieces: Piece2D[], id: string): Piece2D[] {
  const found = pieces.some((p) => p.id === id);
  if (!found) {
    return pieces;
  }
  return pieces.map((p) => (p.id === id ? mirrorPieceInPlace(p) : p));
}

/**
 * Rastet den Versatz einer Gruppe an Kanten der übrigen Stücke (Bounding-Box der Gruppe, Anfang/Ende), sonst aufs Raster; nie links/oben über 0.
 * Kanten von `blockers` (Raum-Hindernisse) zählen wie die von Nachbarstücken, landen aber nie im Ergebnis.
 */
export function snapGroupDelta(pieces: Piece2D[], ids: readonly string[], rawDx: number, rawDy: number, toleranceM: number, gridM = 0.5, blockers: readonly Piece2D[] = []): { dx: number; dy: number } {
  const set = new Set(ids);
  const moving = pieces.filter((p) => set.has(p.id));
  if (moving.length === 0) return { dx: 0, dy: 0 };
  const others = [...pieces.filter((p) => !set.has(p.id)), ...blockers];
  const minX = Math.min(...moving.map((p) => p.x));
  const maxX = Math.max(...moving.map((p) => p.x + p.w));
  const minY = Math.min(...moving.map((p) => p.y));
  const maxY = Math.max(...moving.map((p) => p.y + p.d));
  const xEdges = others.flatMap((p) => [p.x, p.x + p.w]);
  const yEdges = others.flatMap((p) => [p.y, p.y + p.d]);
  const dx = Math.max(-minX, snapDelta(rawDx, [minX, maxX], xEdges, toleranceM, gridM));
  const dy = Math.max(-minY, snapDelta(rawDy, [minY, maxY], yEdges, toleranceM, gridM));
  return { dx: r3(dx), dy: r3(dy) };
}

/** Versatz, bei dem eine Gruppenkante (groupEdges) an einer Nachbarkante (edges) liegt — nur innerhalb der Toleranz; sonst aufs Raster. */
function snapDelta(raw: number, groupEdges: number[], edges: number[], toleranceM: number, gridM: number): number {
  let best: number | null = null;
  for (const e of edges) {
    for (const g of groupEdges) {
      const cand = e - g;
      if (best === null || Math.abs(cand - raw) < Math.abs(best - raw)) best = cand;
    }
  }
  if (best !== null && Math.abs(best - raw) < toleranceM) return best;
  return Math.round(raw / gridM) * gridM;
}

/**
 * Dreht ein Stück um seinen Mittelpunkt; passt es dort nicht, rückt es wie beim Ziehen an die nächste freie Stelle. Quadratische Ecken-Stücke drehen an Ort und Stelle.
 * `blockers` sind zusätzliche feste Stücke (z. B. andere Ebene), denen ausgewichen wird; sie landen nie im Ergebnis.
 */
export function rotatePieceAroundCenter(pieces: Piece2D[], id: string, options?: PlacementOptions, blockers: readonly Piece2D[] = []): Piece2D[] {
  const p = pieces.find((q) => q.id === id);
  if (!p) return pieces;
  if (p.corner !== undefined && Math.abs(p.w - p.d) < 1e-6) return rotatePieceById(pieces, id);
  const r = rotatePieceInPlace(p);
  const cx = p.x + p.w / 2;
  const cy = p.y + p.d / 2;
  const pos = findFreePosition([...pieces, ...blockers], r.w, r.d, cx - r.w / 2, cy - r.d / 2, id, options);
  return pieces.map((q) => (q.id === id ? { ...r, x: pos.x, y: pos.y } : q));
}

/**
 * Dreht die Auswahl als Block 90° im Uhrzeigersinn um den Mittelpunkt ihrer Bounding-Box; null bei Kollision mit anderen Stücken.
 * Die Auswahl rastet danach auf dem Raster (Anfang der Bounding-Box), liegt nie links/oben über 0.
 */
export function rotateGroupAroundCenter(pieces: Piece2D[], ids: readonly string[], gridM = 0.5, blockers: readonly Piece2D[] = []): Piece2D[] | null {
  const set = new Set(ids);
  const moving = pieces.filter((p) => set.has(p.id));
  if (moving.length === 0) return pieces;
  const minX = Math.min(...moving.map((p) => p.x));
  const maxX = Math.max(...moving.map((p) => p.x + p.w));
  const minY = Math.min(...moving.map((p) => p.y));
  const maxY = Math.max(...moving.map((p) => p.y + p.d));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Uhrzeigersinn bei y nach unten: (dx, dy) -> (-dy, dx) um die Mitte.
  const turned = moving.map((p) => {
    const r = rotatePieceInPlace(p);
    return { ...r, x: cx - (p.y + p.d - cy), y: cy + (p.x - cx) };
  });
  const nMinX = Math.min(...turned.map((q) => q.x));
  const nMinY = Math.min(...turned.map((q) => q.y));
  let sx = Math.round(nMinX / gridM) * gridM - nMinX;
  if (nMinX + sx < 0) sx -= nMinX + sx;
  let sy = Math.round(nMinY / gridM) * gridM - nMinY;
  if (nMinY + sy < 0) sy -= nMinY + sy;
  const placed = new Map(turned.map((q) => [q.id, { ...q, x: r3(q.x + sx), y: r3(q.y + sy) }] as const));
  const fixed = [...pieces.filter((p) => !set.has(p.id)), ...blockers];
  for (const q of placed.values()) {
    if (!fitsAt(fixed, q.x, q.y, q.w, q.d)) return null;
  }
  return pieces.map((p) => placed.get(p.id) ?? p);
}

/** Toleranz für Kantenberührung und leere Rahmen (Meter). */
const RECT_EPS = 1e-6;

/** IDs der Stücke im Rahmen (Meter; w/d dürfen negativ sein = von rechts unten aufgezogen). 'intersect' = überlappt den Rahmen echt, 'contain' = vollständig darin. */
export function piecesInRect(pieces: readonly Piece2D[], rect: { x: number; y: number; w: number; d: number }, mode: 'intersect' | 'contain' = 'intersect'): string[] {
  // Rahmen normalisieren: negative Maße heißen "von rechts unten aufgezogen".
  const x0 = Math.min(rect.x, rect.x + rect.w);
  const x1 = Math.max(rect.x, rect.x + rect.w);
  const y0 = Math.min(rect.y, rect.y + rect.d);
  const y1 = Math.max(rect.y, rect.y + rect.d);
  // Ein leerer Rahmen (ohne Fläche) wählt nichts aus.
  if (x1 - x0 <= RECT_EPS || y1 - y0 <= RECT_EPS) return [];
  return pieces
    .filter((p) => {
      if (mode === 'contain') {
        return p.x >= x0 - RECT_EPS && p.x + p.w <= x1 + RECT_EPS && p.y >= y0 - RECT_EPS && p.y + p.d <= y1 + RECT_EPS;
      }
      // Nur echte Überlappung: bloßes Berühren der Kanten zählt nicht.
      return p.x < x1 - RECT_EPS && p.x + p.w > x0 + RECT_EPS && p.y < y1 - RECT_EPS && p.y + p.d > y0 + RECT_EPS;
    })
    .map((p) => p.id);
}

/** Gewünschte Form eines Stücks im Positions-Inspector: Rechteck, Dreieck (mit Katalogmaß) oder Viertelkreis. */
export type PieceTypeChoice = { kind: 'rect'; w: number; d: number } | { kind: 'triangle'; w: number; d: number } | { kind: 'viertelkreis' };

/** Änderungen aus dem Positions-Inspector; nicht gesetzte Felder bleiben unverändert. */
export interface PieceEdit {
  x?: number;
  y?: number;
  type?: PieceTypeChoice;
}

/**
 * Prüft eine Bearbeitung eines einzelnen Stücks (Position und/oder Typ) und liefert die neue Stückliste.
 * Gleiche Referenz, wenn sich nichts ändert. `blockers` sind feste Stücke (z. B. andere Ebene), gegen die geprüft wird; sie landen nie im Ergebnis.
 */
export function validatePieceEdit(
  pieces: Piece2D[],
  id: string,
  edit: PieceEdit,
  blockers: readonly Piece2D[] = [],
): { ok: true; pieces: Piece2D[] } | { ok: false; reason: string } {
  const p = pieces.find((q) => q.id === id);
  if (!p) return { ok: false, reason: 'Stück nicht gefunden.' };
  if (edit.x !== undefined && (!Number.isFinite(edit.x) || edit.x < 0)) return { ok: false, reason: 'Position darf nicht negativ sein.' };
  if (edit.y !== undefined && (!Number.isFinite(edit.y) || edit.y < 0)) return { ok: false, reason: 'Position darf nicht negativ sein.' };

  // Neue Form: Maße, Ecke und Form. Ohne Typwechsel bleibt alles wie es war.
  let w = p.w;
  let d = p.d;
  let corner: TriangleCorner | undefined = p.corner;
  let shape: PieceShape | undefined = p.shape;
  const t = edit.type;
  if (t) {
    if (t.kind === 'rect') {
      if (!isCatalogRect(t.w, t.d)) return { ok: false, reason: 'Diese Größe gibt es nicht im Katalog.' };
      w = t.w;
      d = t.d;
      corner = undefined;
      shape = undefined;
    } else if (t.kind === 'triangle') {
      if (!isCatalogTriangleBox(t.w, t.d)) return { ok: false, reason: 'Diese Größe gibt es nicht im Katalog.' };
      w = t.w;
      d = t.d;
      // Ein Dreieck behält seine Ecke; aus Rechteck oder Viertelkreis wird die Ecke oben links.
      corner = p.corner !== undefined && p.shape === undefined ? p.corner : 'tl';
      shape = undefined;
    } else {
      w = QUARTER_CIRCLE_RADIUS_M;
      d = QUARTER_CIRCLE_RADIUS_M;
      corner = p.corner ?? 'tl';
      shape = 'viertelkreis';
    }
  }

  const x = edit.x !== undefined ? r3(edit.x) : p.x;
  const y = edit.y !== undefined ? r3(edit.y) : p.y;
  const next: Piece2D = { id: p.id, x, y, w, d };
  if (corner !== undefined) next.corner = corner;
  if (shape !== undefined) next.shape = shape;

  const unchanged = x === p.x && y === p.y && w === p.w && d === p.d && corner === p.corner && shape === p.shape;
  if (unchanged) return { ok: true, pieces };

  if (!fitsAt([...pieces, ...blockers], x, y, w, d, id)) return { ok: false, reason: 'Dort liegt schon ein anderes Stück.' };
  return { ok: true, pieces: pieces.map((q) => (q.id === id ? next : q)) };
}
