import { rotatePieceInPlace, type FilledPiece } from './customShape';
import { QUARTER_CIRCLE_RADIUS_M } from './panels';
import { mirrorTriangleCornerDiagonal, nextTriangleCorner } from './triangle';
import type { TriangleCorner } from './types';

/** Ein aufgenommenes (bewaffnetes oder aus der Palette gezogenes) Werkzeug-Stück, noch nicht platziert.
 *  `block` ist ein eigener Baustein: mehrere Stücke, auf (0,0) normalisiert, als Ganzes platziert. */
export type ToolPayload =
  | { kind: 'piece'; w: number; d: number }
  | { kind: 'triangle'; corner: TriangleCorner; w: number; d: number }
  | { kind: 'viertelkreis'; corner: TriangleCorner }
  | { kind: 'block'; label: string; pieces: FilledPiece[] };

/** Rundet auf mm-Genauigkeit, wie in pieceOps.ts. */
function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Kleinste x/y-Koordinaten der Stücke eines Bausteins. */
function originOf(pieces: FilledPiece[]): { minX: number; minY: number } {
  return { minX: Math.min(...pieces.map((p) => p.x)), minY: Math.min(...pieces.map((p) => p.y)) };
}

/** Dreht einen Baustein 90° im Uhrzeigersinn um seinen Ursprung (Blocktiefe H): x' = H − (y + d), y' = x.
 *  Maße und Ecke je Stück wie rotatePieceInPlace; danach wieder auf (0,0) normalisiert. */
function rotateBlock(b: Extract<ToolPayload, { kind: 'block' }>): Extract<ToolPayload, { kind: 'block' }> {
  const { minX, minY } = originOf(b.pieces);
  const H = payloadSize(b).d;
  const rotated = b.pieces.map((f) => {
    const x = f.x - minX;
    const y = f.y - minY;
    const r = rotatePieceInPlace({ ...f, id: '' });
    return {
      x: H - (y + f.d),
      y: x,
      w: r.w,
      d: r.d,
      ...(r.corner !== undefined ? { corner: r.corner } : {}),
      ...(r.shape !== undefined ? { shape: r.shape } : {}),
    } as FilledPiece;
  });
  const back = originOf(rotated);
  return {
    kind: 'block',
    label: b.label,
    pieces: rotated.map((f) => ({ ...f, x: r3(f.x - back.minX), y: r3(f.y - back.minY) })),
  };
}

/** Dreht ein aufgenommenes Stück um 90° im Uhrzeigersinn — dieselbe Regel wie rotatePieceInPlace. */
export function rotatePayload(p: ToolPayload): ToolPayload {
  if (p.kind === 'block') return rotateBlock(p);
  if (p.kind === 'piece') return { kind: 'piece', w: p.d, d: p.w };
  if (p.kind === 'triangle') return { kind: 'triangle', corner: nextTriangleCorner(p.corner), w: p.d, d: p.w };
  return { kind: 'viertelkreis', corner: nextTriangleCorner(p.corner) };
}

/** Spiegelt ein aufgenommenes Dreieck an der Diagonale; alle anderen Stücke bleiben unverändert. */
export function mirrorPayload(p: ToolPayload): ToolPayload {
  if (p.kind !== 'triangle') return p;
  return { kind: 'triangle', corner: mirrorTriangleCornerDiagonal(p.corner), w: p.d, d: p.w };
}

/** Bounding-Box eines aufgenommenen Stücks in Metern (Viertelkreis: Radius × Radius; Baustein: Box um alle Stücke). */
export function payloadSize(p: ToolPayload): { w: number; d: number } {
  if (p.kind === 'viertelkreis') return { w: QUARTER_CIRCLE_RADIUS_M, d: QUARTER_CIRCLE_RADIUS_M };
  if (p.kind === 'block') {
    if (p.pieces.length === 0) return { w: 0, d: 0 };
    const { minX, minY } = originOf(p.pieces);
    const maxX = Math.max(...p.pieces.map((f) => f.x + f.w));
    const maxY = Math.max(...p.pieces.map((f) => f.y + f.d));
    return { w: r3(maxX - minX), d: r3(maxY - minY) };
  }
  return { w: p.w, d: p.d };
}

/** Macht aus einem einzelnen aufgenommenen Stück ein platziertes Stück an der Position (x, y). */
export function payloadToFilled(p: Exclude<ToolPayload, { kind: 'block' }>, x: number, y: number): FilledPiece {
  if (p.kind === 'piece') return { x, y, w: p.w, d: p.d };
  if (p.kind === 'triangle') return { x, y, w: p.w, d: p.d, corner: p.corner };
  return { x, y, w: QUARTER_CIRCLE_RADIUS_M, d: QUARTER_CIRCLE_RADIUS_M, corner: p.corner, shape: 'viertelkreis' };
}

/** Macht aus dem aufgenommenen Werkzeug platzierte Stücke an der Position (x, y): ein Baustein wird als Ganzes
 *  um (x, y) verschoben, alle anderen Arten ergeben genau ein Stück. */
export function payloadToFilledPieces(p: ToolPayload, x: number, y: number): FilledPiece[] {
  if (p.kind === 'block') {
    return p.pieces.map((f) => ({ ...f, x: r3(f.x + x), y: r3(f.y + y) }));
  }
  return [payloadToFilled(p, x, y)];
}

/** Gleicher Werkzeugtyp und gleiche Maße (Viertelkreis: nur der Typ zählt; Baustein: Name und Stückzahl). */
export function payloadMatches(armed: ToolPayload | null, tile: ToolPayload): boolean {
  if (!armed || armed.kind !== tile.kind) return false;
  if (armed.kind === 'piece' && tile.kind === 'piece') return armed.w === tile.w && armed.d === tile.d;
  if (armed.kind === 'triangle' && tile.kind === 'triangle') return armed.w === tile.w && armed.d === tile.d;
  if (armed.kind === 'block' && tile.kind === 'block') return armed.label === tile.label && armed.pieces.length === tile.pieces.length;
  return true;
}
