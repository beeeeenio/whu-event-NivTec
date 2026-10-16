import type { Piece2D } from './customShape';
import type { ForexPanel, ForexSide, MaterialListItem } from './types';

const EPS = 1e-6;

export const DEFAULT_FOREX_THICKNESS_MM = 5;
/** Die Blende endet so weit unter der Belag-Oberkante (Stolperkante vermeiden). */
export const FOREX_TOP_GAP_MM = 10;

export const FOREX_SIDES: readonly ForexSide[] = ['top', 'right', 'bottom', 'left', 'hyp'];

/** Eine gerade Kante eines Podests in Plan-Metern, mit Außennormale (Einheitsvektor). */
export interface PieceEdge {
  pieceId: string;
  side: ForexSide;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthM: number;
  nx: number;
  ny: number;
}

/** Echtes Dreieck (nicht Viertelkreis) — nur dort gibt es eine 'hyp'-Kante. */
export function isTrianglePiece(piece: Pick<Piece2D, 'corner' | 'shape'>): boolean {
  return piece.corner !== undefined && piece.shape !== 'viertelkreis';
}

/**
 * Alle geraden Kanten eines Podests. Rechteck: 4 Seiten. Dreieck: die beiden Katheten an der
 * `corner`-Ecke + 'hyp'. Viertelkreis: nur die beiden Radiuskanten (der Bogen bekommt keine Blende).
 */
export function pieceEdges(piece: Piece2D): PieceEdge[] {
  const { id, x, y, w, d } = piece;
  const x2 = x + w;
  const y2 = y + d;
  const axis = (side: ForexSide, ax: number, ay: number, bx: number, by: number, nx: number, ny: number): PieceEdge => ({
    pieceId: id, side, x1: ax, y1: ay, x2: bx, y2: by, lengthM: Math.hypot(bx - ax, by - ay), nx, ny,
  });
  const top = axis('top', x, y, x2, y, 0, -1);
  const bottom = axis('bottom', x, y2, x2, y2, 0, 1);
  const left = axis('left', x, y, x, y2, -1, 0);
  const right = axis('right', x2, y, x2, y2, 1, 0);

  if (piece.corner === undefined) return [top, right, bottom, left];

  const legs: Record<NonNullable<Piece2D['corner']>, PieceEdge[]> = {
    tl: [top, left],
    tr: [top, right],
    bl: [bottom, left],
    br: [right, bottom],
  };
  const edges = [...legs[piece.corner]];
  if (isTrianglePiece(piece)) {
    // Schräge verbindet die beiden Nachbarecken des rechten Winkels; Normale zeigt von ihm weg.
    const fromTlToBr = piece.corner === 'tr' || piece.corner === 'bl';
    const [ax, ay, bx, by] = fromTlToBr ? [x, y, x2, y2] : [x2, y, x, y2];
    const len = Math.hypot(w, d);
    // Normale senkrecht zur Schräge, Richtung weg von der rechtwinkligen Ecke.
    let nx = (by - ay) / len;
    let ny = -(bx - ax) / len;
    const cornerX = piece.corner === 'tl' || piece.corner === 'bl' ? x : x2;
    const cornerY = piece.corner === 'tl' || piece.corner === 'tr' ? y : y2;
    if (nx * (ax - cornerX) + ny * (ay - cornerY) < 0) { nx = -nx; ny = -ny; }
    edges.push({ pieceId: id, side: 'hyp', x1: ax, y1: ay, x2: bx, y2: by, lengthM: len, nx, ny });
  }
  return edges;
}

/** Hat das Podest überhaupt eine Kante dieser Seite (z. B. kein 'bottom' bei Dreieck 'tl')? */
export function pieceHasSide(piece: Piece2D, side: ForexSide): boolean {
  return pieceEdges(piece).some((e) => e.side === side);
}

const OPPOSITE: Record<Exclude<ForexSide, 'hyp'>, ForexSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function samePoint(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) < EPS && Math.abs(ay - by) < EPS;
}

/** Liegt an dieser Kante (auch nur teilweise) ein Nachbarpodest an? */
function isEdgeCovered(edge: PieceEdge, others: PieceEdge[]): boolean {
  if (edge.side === 'hyp') {
    return others.some(
      (o) =>
        o.side === 'hyp' &&
        ((samePoint(o.x1, o.y1, edge.x1, edge.y1) && samePoint(o.x2, o.y2, edge.x2, edge.y2)) ||
          (samePoint(o.x1, o.y1, edge.x2, edge.y2) && samePoint(o.x2, o.y2, edge.x1, edge.y1))),
    );
  }
  const horizontal = edge.side === 'top' || edge.side === 'bottom';
  const opposite = OPPOSITE[edge.side];
  return others.some((o) => {
    if (o.side !== opposite) return false;
    if (horizontal) {
      if (Math.abs(o.y1 - edge.y1) > EPS) return false;
      const overlap = Math.min(Math.max(o.x1, o.x2), Math.max(edge.x1, edge.x2)) - Math.max(Math.min(o.x1, o.x2), Math.min(edge.x1, edge.x2));
      return overlap > EPS;
    }
    if (Math.abs(o.x1 - edge.x1) > EPS) return false;
    const overlap = Math.min(Math.max(o.y1, o.y2), Math.max(edge.y1, edge.y2)) - Math.max(Math.min(o.y1, o.y2), Math.min(edge.y1, edge.y2));
    return overlap > EPS;
  });
}

/** Alle freien Außenkanten (kein Nachbarpodest liegt an) — nur dort ist eine Forex-Blende möglich. */
export function freeEdges(pieces: Piece2D[]): PieceEdge[] {
  const all = pieces.map((p) => ({ id: p.id, edges: pieceEdges(p) }));
  const out: PieceEdge[] = [];
  for (const { id, edges } of all) {
    const others = all.filter((o) => o.id !== id).flatMap((o) => o.edges);
    for (const edge of edges) {
      if (!isEdgeCovered(edge, others)) out.push(edge);
    }
  }
  return out;
}

export function forexKey(pieceId: string, side: ForexSide): string {
  return `${pieceId}::${side}`;
}

/** Nächste freie, stabile Blenden-ID ("fx-N", N = größte vorhandene + 1). */
export function nextForexId(panels: ForexPanel[]): string {
  let max = 0;
  for (const p of panels) {
    const m = /^fx-(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `fx-${max + 1}`;
}

/** Schaltet die Blende an einer Kante an/aus. */
export function toggleForexPanel(panels: ForexPanel[], pieceId: string, side: ForexSide): ForexPanel[] {
  if (panels.some((p) => p.pieceId === pieceId && p.side === side)) {
    return panels.filter((p) => !(p.pieceId === pieceId && p.side === side));
  }
  return [...panels, { id: nextForexId(panels), pieceId, side }];
}

/** printGroup der Schnellaktion „Alle Vorderkanten“ — wie in der Stadthallenplanung: ein Druck über alle. */
export const FRONT_PRINT_GROUP = 'vorne';

/** Schnellaktion „Alle Vorderkanten“: ergänzt eine Blende an jeder freien 'bottom'-Kante (Druckgruppe „vorne“). */
export function addAllFrontEdges(pieces: Piece2D[], panels: ForexPanel[]): ForexPanel[] {
  let next = panels;
  for (const edge of freeEdges(pieces)) {
    if (edge.side !== 'bottom') continue;
    if (next.some((p) => p.pieceId === edge.pieceId && p.side === 'bottom')) continue;
    next = [...next, { id: nextForexId(next), pieceId: edge.pieceId, side: 'bottom', printGroup: FRONT_PRINT_GROUP }];
  }
  return next;
}

export interface PlacedForexPanel {
  panel: ForexPanel;
  edge: PieceEdge;
  thicknessMm: number;
}

/**
 * Nur Blenden, die im aktuellen Plan wirklich passen (Podest existiert, Kante existiert und ist
 * frei). Verschobene/gelöschte Podeste lassen ihre Blenden so still wegfallen.
 */
export function placeForexPanels(pieces: Piece2D[], panels: ForexPanel[]): PlacedForexPanel[] {
  const free = new Map(freeEdges(pieces).map((e) => [forexKey(e.pieceId, e.side), e]));
  const out: PlacedForexPanel[] = [];
  for (const panel of panels) {
    const edge = free.get(forexKey(panel.pieceId, panel.side));
    if (!edge) continue;
    out.push({ panel, edge, thicknessMm: panel.thicknessMm ?? DEFAULT_FOREX_THICKNESS_MM });
  }
  return out;
}

/**
 * Reihenfolge links → rechts, wie man von außen auf die Blenden schaut — für einen Druck, der
 * über mehrere Platten läuft. Gleiche Formel wie in der Stadthallenplanung.
 */
export function sortPanelsForPrint(placed: PlacedForexPanel[]): PlacedForexPanel[] {
  const key = ({ edge: e }: PlacedForexPanel) => ((e.x1 + e.x2) / 2) * e.ny - ((e.y1 + e.y2) / 2) * e.nx;
  return [...placed].sort((a, b) => key(a) - key(b));
}

export interface ForexPrintGroup {
  /** printGroup, oder `#<id>` für eine Platte ohne Gruppe (eigener Druck). */
  key: string;
  printGroup?: string;
  /** Platten in Druckreihenfolge (links → rechts von außen). */
  panels: PlacedForexPanel[];
  lengthM: number;
}

/** Platten mit gleicher printGroup bilden einen Druck, alle anderen je einen eigenen. */
export function forexPrintGroups(placed: PlacedForexPanel[]): ForexPrintGroup[] {
  const groups = new Map<string, PlacedForexPanel[]>();
  for (const p of placed) {
    const key = p.panel.printGroup ?? `#${p.panel.id}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return Array.from(groups.entries()).map(([key, panels]) => ({
    key,
    printGroup: panels[0].panel.printGroup,
    panels: sortPanelsForPrint(panels),
    lengthM: panels.reduce((s, p) => s + p.edge.lengthM, 0),
  }));
}

/** Setzt (oder entfernt mit undefined) die Druckgruppe einer Blende. */
export function setForexPrintGroup(panels: ForexPanel[], panelId: string, printGroup: string | undefined): ForexPanel[] {
  return panels.map((p) => {
    if (p.id !== panelId) return p;
    const next: ForexPanel = { id: p.id, pieceId: p.pieceId, side: p.side };
    if (p.thicknessMm !== undefined) next.thicknessMm = p.thicknessMm;
    if (printGroup) next.printGroup = printGroup;
    return next;
  });
}

/** Nächster freier Gruppenname „druck-N“. */
export function nextPrintGroupName(panels: ForexPanel[]): string {
  const used = new Set(panels.map((p) => p.printGroup));
  let n = 1;
  while (used.has(`druck-${n}`)) n++;
  return `druck-${n}`;
}

/** Drucke nur für Blenden behalten, die es noch gibt. */
export function pruneForexPrints(prints: Record<string, string>, panels: ForexPanel[]): Record<string, string> {
  const ids = new Set(panels.map((p) => p.id));
  const entries = Object.entries(prints).filter(([id]) => ids.has(id));
  return entries.length === Object.keys(prints).length ? prints : Object.fromEntries(entries);
}

/** Zuschnittmaß einer Blende in mm: Kantenlänge × (Belag-Oberkante − 1 cm). */
export function forexPanelSizeMm(edge: PieceEdge, heightCm: number): { lengthMm: number; heightMm: number } {
  return {
    lengthMm: Math.round(edge.lengthM * 1000),
    heightMm: Math.max(0, Math.round(heightCm * 10) - FOREX_TOP_GAP_MM),
  };
}

/** Materiallisten-Positionen: Forex-Platten nach Maß gezählt, z. B. „Forex 2000 × 590 mm, 5 mm“. */
export function buildForexMaterialItems(pieces: Piece2D[], panels: ForexPanel[], heightCm: number): MaterialListItem[] {
  const counts = new Map<string, { lengthMm: number; heightMm: number; thicknessMm: number; count: number }>();
  for (const { edge, thicknessMm } of placeForexPanels(pieces, panels)) {
    const { lengthMm, heightMm } = forexPanelSizeMm(edge, heightCm);
    const key = `${lengthMm}|${heightMm}|${thicknessMm}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { lengthMm, heightMm, thicknessMm, count: 1 });
  }
  const fmt = (v: number) => v.toString().replace('.', ',');
  return Array.from(counts.values())
    .sort((a, b) => b.lengthMm - a.lengthMm || b.heightMm - a.heightMm || a.thicknessMm - b.thicknessMm)
    .map((e, i) => ({
      pos: i + 1,
      gruppe: 'VERKLEIDUNG',
      artikel: `Forex ${e.lengthMm} × ${e.heightMm} mm, ${fmt(e.thicknessMm)} mm`,
      menge: e.count,
      einheit: 'Stk.',
    }));
}

/** Hängt zusätzliche Positionen an eine Materialliste an und nummeriert fortlaufend weiter. */
export function appendMaterialItems(base: MaterialListItem[], extra: MaterialListItem[]): MaterialListItem[] {
  if (extra.length === 0) return base;
  return [...base, ...extra.map((item, i) => ({ ...item, pos: base.length + i + 1 }))];
}
