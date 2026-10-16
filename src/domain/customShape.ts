import {
  catalogSizeKey,
  isSondermassPiece,
  QUARTER_CIRCLE_RADIUS_M,
  QUARTER_CIRCLE_SIZE_KEY,
  RECT_CATALOG,
  TRIANGLE_2X1_LEFT_KEY,
  TRIANGLE_2X1_RIGHT_KEY,
  TRIANGLE_PANEL_SIZE_M,
  TRIANGLE_SIZE_KEY,
  widthsForDepth,
} from './panels';
import { mirrorTriangleCornerDiagonal, nextTriangleCorner, triangleHand } from './triangle';
import type { LayoutResult, PanelInstance, PieceShape, TriangleCorner } from './types';

const EPS = 1e-6;
const GRID_M = 0.5;
export const EDGE_SNAP_TOLERANCE_M = 0.2;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function snapToGrid(v: number): number {
  return Math.round(v / GRID_M) * GRID_M;
}

/** Rastet v (Anfangskoordinate eines Stücks der Länge size) auf die nächste Kante vorhandener
 *  Stücke (Anfang an Ende/Anfang, Ende an Anfang/Ende), wenn sie näher als die Toleranz liegt;
 *  sonst aufs 0,5-m-Raster. */
function snapCoord(v: number, size: number, edges: number[], toleranceM = EDGE_SNAP_TOLERANCE_M): number {
  let bestCandidate: number | null = null;
  let bestDistance = toleranceM;

  for (const edge of edges) {
    const candidates = [edge, edge - size];
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - v);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCandidate = candidate;
      }
    }
  }

  if (bestCandidate !== null) {
    return round3(bestCandidate);
  }
  return snapToGrid(v);
}

/**
 * Ein Reihenkonzept gibt es nicht mehr: jedes Stück ist ein frei positioniertes, frei
 * drehbares 2D-Rechteck. Ein 2×1-m-Podest bleibt derselbe reale Artikel, ob als (w=2,d=1)
 * oder gedreht als (w=1,d=2) platziert — keine neue Geometrie, nur eine andere Ausrichtung
 * derselben echten Platte.
 */
export interface Piece2D {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  /** Nur gesetzt für das echte Dreieckpodest (Katheten 1×1 m) — welche Ecke der Bounding-Box
   *  den rechten Winkel trägt. Undefined = normales Rechteck (der Normalfall). WICHTIG: ein
   *  Dreieck hat dieselbe Bounding-Box (1×1) wie das echte 1×1-Sondermaß-Rechteck — deshalb
   *  IMMER zuerst `corner !== undefined` prüfen, bevor irgendeine (w,d)-basierte Katalogfunktion
   *  (isSondermassPiece/isPrimaryPanelPiece/catalogSizeKey) aufgerufen wird, sonst würde ein
   *  Dreieck fälschlich als das Rechteck erkannt. */
  corner?: TriangleCorner;
  /** Form des Stücks — undefined = normales Rechteck. Shape-Feld und corner-Feld gehören zusammen. */
  shape?: PieceShape;
}

/** Frisch erzeugtes Stück ohne id — von Keil/Zeichnen-Werkzeug erzeugt, bevor es dem
 *  Canvas-Zustand hinzugefügt wird (genau eine Stelle vergibt danach eine id: der Aufrufer). */
export interface FilledPiece {
  x: number;
  y: number;
  w: number;
  d: number;
  corner?: TriangleCorner;
  shape?: PieceShape;
}

let idCounter = 0;
export function makePieceId(): string {
  idCounter += 1;
  return `piece-${idCounter}`;
}

/** Reserviert angegebene Stück-IDs für die Zukunft — wird beim Laden einer gespeicherten Konfiguration
 *  aufgerufen, um sicherzustellen, dass neu erstellte Stücke keine bereits vorhandenen IDs erhalten. */
export function reservePieceIds(ids: Iterable<string>): void {
  for (const id of ids) {
    const m = /^piece-(\d+)$/.exec(id);
    if (m) idCounter = Math.max(idCounter, Number(m[1]));
  }
}

/** Dreht ein Stück an Ort und Stelle — für ein Rechteck der bekannte Breite/Tiefe-Tausch
 *  (2 Zustände); für ein Ecken-Stück (Dreieck/Viertelkreis): Wechsel zur nächsten Ecke im
 *  Uhrzeigersinn UND Tausch der Bounding-Box-Dimensionen w↔d, was 4 Zustände pro Stück gibt
 *  (oder 2 bei 1×1). Für 2×1-Dreiecke: Rotation wechselt die Box zwischen 2×1 und 1×2.
 *  Zentrale Stelle statt (wie bisher) dreifach dupliziert in den Konfiguratoren. */
export function rotatePieceInPlace(piece: Piece2D): Piece2D {
  if (piece.corner !== undefined) {
    return { ...piece, corner: nextTriangleCorner(piece.corner), w: piece.d, d: piece.w };
  }
  return { ...piece, w: piece.d, d: piece.w };
}

/** Spiegelt ein Stück an der Hauptdiagonale (x/y-Transposition der Box). Nur sinnvoll für
 *  nicht-quadratische Ecken-Stücke wie 2×1-Dreiecke; quadratische Stücke oder Rechtecke
 *  werden unverändert zurückgegeben. */
export function mirrorPieceInPlace(piece: Piece2D): Piece2D {
  if (piece.corner === undefined) return piece;
  if (Math.abs(piece.w - piece.d) < 1e-6) return piece; // quadratisch: kein Unterschied
  // Non-square cornered piece: swap w/d and mirror the corner
  return { ...piece, w: piece.d, d: piece.w, corner: mirrorTriangleCornerDiagonal(piece.corner) };
}

export interface CatalogPieceOption {
  w: number;
  d: number;
  isSondermass: boolean;
}

/** Gruppierungsschlüssel für ein Dreieck-Podest mit Ecke in Materialliste/Zählung.
 *  Unterscheidet zwischen 1×1, 2×1-links, und 2×1-rechts je nach Größe und Orientierung. */
export function triangleSizeKey(piece: { w: number; d: number; corner?: TriangleCorner }): string {
  if (piece.corner === undefined) {
    throw new Error('triangleSizeKey: corner is required');
  }
  if (Math.abs(piece.w - TRIANGLE_PANEL_SIZE_M) < 1e-6 && Math.abs(piece.d - TRIANGLE_PANEL_SIZE_M) < 1e-6) {
    return TRIANGLE_SIZE_KEY;
  }
  const hand = triangleHand(piece.corner, piece.w, piece.d);
  return hand === 'links' ? TRIANGLE_2X1_LEFT_KEY : TRIANGLE_2X1_RIGHT_KEY;
}

/** Feste, kanvas-unabhängige Palette — es gibt kein pro-Canvas fixiertes "rowDepthM" mehr:
 *  Unterbau und Thekenplatte bauen beide aus demselben Katalog, Drehen ersetzt die alte
 *  Ausrichtungs-Bindung. Jede Größe ist gleichermaßen frei drehbar (siehe panels.ts). */
export function catalogPieceOptions(): CatalogPieceOption[] {
  return RECT_CATALOG.map((p) => ({ w: p.w, d: p.d, isSondermass: !!p.sondermassOnly }));
}

function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ad: number,
  bx: number,
  by: number,
  bw: number,
  bd: number,
): boolean {
  return ax < bx + bw - EPS && bx < ax + aw - EPS && ay < by + bd - EPS && by < ay + ad - EPS;
}

/**
 * Reine Kollisionsprüfung an einer gegebenen Position, ohne Meinung zu Kanvas-Grenzen — für
 * Platzieren, Verschieben UND Drehen-in-place. `excludeId` lässt ein Stück sich nicht an sich
 * selbst stoßen (wichtig beim Verschieben/Drehen des bereits vorhandenen Stücks).
 */
export function fitsAt(existing: Piece2D[], x: number, y: number, w: number, d: number, excludeId?: string): boolean {
  return existing.every((p) => p.id === excludeId || !aabbOverlap(x, y, w, d, p.x, p.y, p.w, p.d));
}

/**
 * Prüft eine ganze Charge frisch erzeugter Stücke (Dreieck-Keil, Zeichnen-Werkzeug) atomar
 * gegen vorhandene Stücke — alles oder nichts. Anders als beim Verschieben eines einzelnen
 * Stücks wird hier NICHT nachgerückt: das würde eine ganze Keil-/Zeichnen-Form unvorhersehbar
 * verschieben, statt ehrlich zu melden "hier passt sie nicht". Die Stücke EINER Charge
 * überlappen sich per Konstruktion nie untereinander (reine Katalog-Zerlegung einer
 * Spannweite), daher genügt die Prüfung gegen die vorhandenen Stücke.
 */
export function fitsAllAt(existing: Piece2D[], pieces: FilledPiece[]): boolean {
  return pieces.every((p) => fitsAt(existing, p.x, p.y, p.w, p.d));
}

function isWithinCanvas(x: number, y: number): boolean {
  return x >= -EPS && y >= -EPS;
}

/** Optionale Einstellungen für die Platzsuche — z. B. eine aus Bildschirm-Pixeln umgerechnete Fangweite. */
export interface PlacementOptions {
  /** Kanten-Fangweite in Metern, z. B. aus 8 Bildschirm-px umgerechnet. */
  snapToleranceM?: number;
}

/**
 * Sucht die nächstgelegene freie, rasterkonforme (x,y)-Position für ein Stück (w,d): testet
 * zuerst die gewünschte (gerasterte) Position, dann wachsende quadratische Ringe im 0,5-m-
 * Raster darum herum (nächster Kandidat zuerst, nach echter Distanz sortiert). Anders als die
 * frühere 1D-Suche (die an einer FESTEN Bühnenbreite scheitern konnte) gibt es hier KEINE
 * äußere Grenze — die Fläche wächst ja ausschließlich mit dem Inhalt — daher liefert diese
 * Funktion für ein EINZELNES Stück immer ein Ergebnis: spätestens außerhalb der Bounding Box
 * aller vorhandenen Stücke ist Platz frei. Gilt nur für Einzelstück-Platzierung/-Verschiebung;
 * für Mehrstück-Chargen siehe `fitsAllAt` (dort ist "kein Platz" ein echter Fehlerfall).
 */
export function findFreePosition(
  existing: Piece2D[],
  w: number,
  d: number,
  desiredX: number,
  desiredY: number,
  excludeId?: string,
  options?: PlacementOptions,
): { x: number; y: number } {
  const snapToleranceM = options?.snapToleranceM ?? EDGE_SNAP_TOLERANCE_M;
  // Baue Kanten-Listen aus bestehenden Stücken
  const xEdges = existing
    .filter((p) => p.id !== excludeId)
    .flatMap((p) => [p.x, p.x + p.w]);
  const yEdges = existing
    .filter((p) => p.id !== excludeId)
    .flatMap((p) => [p.y, p.y + p.d]);

  // Versuche Kanten-Rastern mit Fallback auf Grid
  const dx = Math.max(0, snapCoord(desiredX, w, xEdges, snapToleranceM));
  const dy = Math.max(0, snapCoord(desiredY, d, yEdges, snapToleranceM));
  const candidateOk = (x: number, y: number) => isWithinCanvas(x, y) && fitsAt(existing, x, y, w, d, excludeId);

  if (candidateOk(dx, dy)) return { x: dx, y: dy };

  const farthest = existing.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0);
  const maxRing = Math.ceil((farthest + 20) / GRID_M);
  for (let ring = 1; ring <= maxRing; ring++) {
    const candidates: { x: number; y: number }[] = [];
    for (let i = -ring; i <= ring; i++) {
      candidates.push({ x: dx + i * GRID_M, y: dy - ring * GRID_M }, { x: dx + i * GRID_M, y: dy + ring * GRID_M });
    }
    for (let j = -ring + 1; j <= ring - 1; j++) {
      candidates.push({ x: dx - ring * GRID_M, y: dy + j * GRID_M }, { x: dx + ring * GRID_M, y: dy + j * GRID_M });
    }
    candidates.sort((a, b) => Math.hypot(a.x - dx, a.y - dy) - Math.hypot(b.x - dx, b.y - dy));
    for (const c of candidates) if (candidateOk(c.x, c.y)) return c;
  }
  // Laut obigem Argument unerreichbar, aber als Sicherheitsnetz: rechts neben allem Bestehenden.
  return { x: snapToGrid(existing.reduce((m, p) => Math.max(m, p.x + p.w), 0)), y: dy };
}

/**
 * Baut ein LayoutResult direkt aus einer flachen Stückliste auf — keine Reihen, keine
 * Basisfläche. `orientation`/`cols`/`rows` sind für dieses Ergebnis reine Platzhalter (von
 * keinem Verbraucher des freien 2D-Modells gelesen; siehe Architektur-Prüfung im Plan).
 */
export function buildLayoutFromPieces(pieces: Piece2D[]): LayoutResult {
  const panels: PanelInstance[] = [];
  const panelCountsBySize: Record<string, number> = {};
  let hasSondermass = false;
  let maxX = 0;
  let maxY = 0;

  for (const piece of pieces) {
    if (piece.w <= 0 || piece.d <= 0) continue;
    // Dreieck/Viertelkreis zuerst behandeln und dabei komplett aussteigen (`continue`) — eine (w,d)-basierte
    // Katalogfunktion wie isSondermassPiece/catalogSizeKey würde (1,1) sonst fälschlich als das
    // echte 1×1-Sondermaß-Rechteck erkennen (identische Bounding-Box, siehe Piece2D.corner-Doku).
    if (piece.corner !== undefined) {
      const sizeKey = piece.shape === 'viertelkreis' ? QUARTER_CIRCLE_SIZE_KEY : triangleSizeKey(piece);
      panels.push({
        x: round3(piece.x),
        y: round3(piece.y),
        w: piece.w,
        d: piece.d,
        sizeKey,
        isSondermass: false,
        corner: piece.corner,
        shape: piece.shape,
      });
      panelCountsBySize[sizeKey] = (panelCountsBySize[sizeKey] ?? 0) + 1;
      maxX = Math.max(maxX, piece.x + piece.w);
      maxY = Math.max(maxY, piece.y + piece.d);
      continue;
    }
    const sondermass = isSondermassPiece(piece.w, piece.d);
    const key = catalogSizeKey(piece.w, piece.d);
    panels.push({ x: round3(piece.x), y: round3(piece.y), w: piece.w, d: piece.d, sizeKey: key, isSondermass: sondermass });
    panelCountsBySize[key] = (panelCountsBySize[key] ?? 0) + 1;
    hasSondermass = hasSondermass || sondermass;
    maxX = Math.max(maxX, piece.x + piece.w);
    maxY = Math.max(maxY, piece.y + piece.d);
  }

  return {
    orientation: 'normal',
    widthM: round3(maxX),
    depthM: round3(maxY),
    areaM2: round3(
      panels.reduce((sum, p) => {
        let area: number;
        if (p.corner !== undefined) {
          // Dreieck hat halbe Fläche der Bounding-Box, Viertelkreis hat π*r²/4
          area = p.shape === 'viertelkreis'
            ? (Math.PI * QUARTER_CIRCLE_RADIUS_M * QUARTER_CIRCLE_RADIUS_M) / 4
            : (p.w * p.d) / 2;
        } else {
          area = p.w * p.d;
        }
        return sum + area;
      }, 0),
    ),
    cols: 0,
    rows: 0,
    panels,
    panelCountsBySize,
    hasSondermass,
  };
}

/**
 * Enges Begrenzungsrechteck der tatsächlich belegten Fläche — anders als layout.widthM/depthM
 * (die immer vom Ursprung (0,0) aus messen, siehe buildLayoutFromPieces) berücksichtigt das
 * auch, wenn eine Ebene nicht bündig an der Vorderkante gebaut wurde. Für den Tresen-Referenz-
 * Umriss der jeweils ANDEREN Ebene gedacht — sonst zeigt der Umriss eine Fläche, in der die
 * echten Platten gar nicht liegen, sobald eine Ebene versetzt statt bündig gebaut wurde.
 */
export function boundingBoxOf(
  panels: ReadonlyArray<{ x: number; y: number; w: number; d: number }>,
): { x: number; y: number; widthM: number; depthM: number } | null {
  if (panels.length === 0) return null;
  const minX = Math.min(...panels.map((p) => p.x));
  const minY = Math.min(...panels.map((p) => p.y));
  const maxX = Math.max(...panels.map((p) => p.x + p.w));
  const maxY = Math.max(...panels.map((p) => p.y + p.d));
  return { x: round3(minX), y: round3(minY), widthM: round3(maxX - minX), depthM: round3(maxY - minY) };
}

/**
 * "Alles verschieben": verschiebt alle Stücke gemeinsam waagerecht um dx Meter. Die Stücke
 * bleiben untereinander unverändert, können also nicht neu kollidieren. null, wenn dabei ein
 * Stück links über x=0 hinausrutschen würde — negative Koordinaten gibt es im Plan nicht.
 */
export function shiftPieces(pieces: Piece2D[], dx: number): Piece2D[] | null {
  if (pieces.some((p) => p.x + dx < -EPS)) return null;
  return pieces.map((p) => ({ ...p, x: round3(p.x + dx) }));
}

/**
 * Rückt die Stücke so, dass das linkeste an x=0 und das vorderste an y=0 liegt — für alles, was
 * aus dem Plan abgeleitet wird (Grundriss, 3D, PPTX, Materialliste, Kennzahlen). Sonst zählt die
 * bloße Lage auf der Zeichenfläche (z.B. nach "Alles verschieben") als Leerraum mit, weil
 * buildLayoutFromPieces Breite/Tiefe immer vom Ursprung aus misst.
 */
export function normalizeToOrigin(pieces: Piece2D[]): Piece2D[] {
  const box = boundingBoxOf(pieces);
  if (!box || (Math.abs(box.x) < EPS && Math.abs(box.y) < EPS)) return pieces;
  return pieces.map((p) => ({ ...p, x: round3(p.x - box.x), y: round3(p.y - box.y) }));
}

/**
 * Zerlegt eine Spannweite in echte Katalogstücke (greedy Zerlegung) — kennt
 * nur "eine Achse mit fester Tiefe", kein Reihen-/Richtungskonzept. Grundlage für die
 * horizontalen UND (transponiert) vertikalen Wrapper unten sowie für den Dreieck-Keil.
 */
function fillSpanWithCatalog(spanWidthM: number, pieceDepthM: number, offsetX: number): { x: number; w: number }[] {
  if (spanWidthM <= 0) return [];
  const widths = widthsForDepth(pieceDepthM);
  const out: { x: number; w: number }[] = [];
  let x = 0;
  while (spanWidthM - x > EPS) {
    const w = widths.find((cw) => cw <= spanWidthM - x + EPS);
    if (w === undefined) break;
    out.push({ x: round3(offsetX + x), w });
    x = round3(x + w);
  }
  return out;
}

/** Waagerechter Lauf, feste Tiefe: Zerlegung entlang x bei fixer y — z.B. der Hauptlauf einer Theke. */
export function fillHorizontalSpan(spanWidthM: number, pieceDepthM: number, offsetX: number, fixedY: number): FilledPiece[] {
  return fillSpanWithCatalog(spanWidthM, pieceDepthM, offsetX).map((p) => ({ x: p.x, y: fixedY, w: p.w, d: pieceDepthM }));
}

/** Senkrechter Lauf, feste Breite — für einen Eck-Schenkel. Reine Vertauschung derselben
 *  1D-Zerlegung (keine eigene Mathematik): die "Breite" der Zerlegung wird hier als y-Lauf
 *  interpretiert, die "feste Tiefe" der Zerlegung als konstante Stückbreite. */
export function fillVerticalSpan(spanDepthM: number, pieceWidthM: number, fixedX: number, offsetY: number): FilledPiece[] {
  return fillSpanWithCatalog(spanDepthM, pieceWidthM, offsetY).map((p) => ({ x: fixedX, y: p.x, w: pieceWidthM, d: p.w }));
}

interface TaperRow {
  depthM: number;
  pieces: { x: number; w: number; corner?: TriangleCorner }[];
}

/** Ob eine Zeile schon so schmal zusammengelaufen ist, dass sie statt eines Rechteck-Streifens
 *  eine echte Dreieckspitze bekommt (siehe linearTaperRows) — nur bei 1×1 m, der Bounding-Box
 *  des echten Dreieckpodests. */
function isTaperTipEligible(w: number, pieceDepthM: number): boolean {
  return Math.abs(w - TRIANGLE_PANEL_SIZE_M) < EPS && Math.abs(pieceDepthM - TRIANGLE_PANEL_SIZE_M) < EPS;
}

/**
 * Linear zulaufende Reihen, zentriert im lokalen Rahmen [0, baseWidthM] und in Katalogstücke
 * zerlegt — Grundlage für den Dreieck-Keil. Rasterbreite ist einheitlich 0,5 m auf beiden
 * Achsen — die frühere Einschränkung auf volle 1-m-Schritte für die feste 2-m-Achse (weil es
 * dort angeblich kein Sondermaß-Substitut gab) ist mit der 0,5×2-Platte hinfällig.
 */
function linearTaperRows(baseWidthM: number, rowCount: number, pieceDepthM: number): TaperRow[] {
  if (rowCount <= 0 || baseWidthM <= 0) return [];
  const widthGrid = GRID_M;
  const rows: TaperRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const raw = (baseWidthM * (rowCount - i)) / (rowCount + 1);
    const w = Math.max(widthGrid, Math.round(raw / widthGrid) * widthGrid);
    const rowOffsetX = snapToGrid((baseWidthM - w) / 2);
    // Die letzte (schmalste) Zeile bekommt, sobald sie auf 1×1 m zusammengelaufen ist, eine
    // echte Dreieckspitze statt eines weiteren flachen Rechteck-Streifens. 'tl' lässt die obere
    // Kante (Anschluss an die Zeile darüber) UND die linke Kante voll stehen — nur die Phantom-
    // Ecke unten rechts, in Zulaufrichtung, bleibt frei.
    const pieces: TaperRow['pieces'] =
      i === rowCount - 1 && isTaperTipEligible(w, pieceDepthM)
        ? [{ x: rowOffsetX, w, corner: 'tl' }]
        : fillSpanWithCatalog(w, pieceDepthM, rowOffsetX);
    rows.push({ depthM: pieceDepthM, pieces });
  }
  return rows;
}

export interface WedgeTemplate {
  baseWidthM: number;
  rowCount: number;
  pieceDepthM: number;
}

/** Fester, handlicher Dreieck-Keil zum Platzieren — 3 Reihen, oben 3 m breit, läuft zu. */
export function defaultWedgeTemplate(pieceDepthM: number): WedgeTemplate {
  return { baseWidthM: 3, rowCount: 3, pieceDepthM };
}

/** Setzt den Keil an eine konkrete Stelle (anchorX/anchorY) — flache Stückliste, keine ids. */
export function wedgePiecesAt(template: WedgeTemplate, anchorX: number, anchorY: number): FilledPiece[] {
  const rows = linearTaperRows(template.baseWidthM, template.rowCount, template.pieceDepthM);
  const pieces: FilledPiece[] = [];
  let y = anchorY;
  for (const row of rows) {
    for (const p of row.pieces) pieces.push({ x: round3(p.x + anchorX), y, w: p.w, d: row.depthM, corner: p.corner });
    y = round3(y + row.depthM);
  }
  return pieces;
}
