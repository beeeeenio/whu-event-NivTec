import type { FilledPiece } from './customShape';
import { QUARTER_CIRCLE_RADIUS_M } from './panels';
import { mirrorTriangleCornerDiagonal, nextTriangleCorner } from './triangle';
import type { TriangleCorner } from './types';

/** Ein aufgenommenes (bewaffnetes oder aus der Palette gezogenes) Werkzeug-Stück, noch nicht platziert. */
export type ToolPayload = { kind: 'piece'; w: number; d: number } | { kind: 'triangle'; corner: TriangleCorner; w: number; d: number } | { kind: 'viertelkreis'; corner: TriangleCorner };

/** Dreht ein aufgenommenes Stück um 90° im Uhrzeigersinn — dieselbe Regel wie rotatePieceInPlace. */
export function rotatePayload(p: ToolPayload): ToolPayload {
  if (p.kind === 'piece') return { kind: 'piece', w: p.d, d: p.w };
  if (p.kind === 'triangle') return { kind: 'triangle', corner: nextTriangleCorner(p.corner), w: p.d, d: p.w };
  return { kind: 'viertelkreis', corner: nextTriangleCorner(p.corner) };
}

/** Spiegelt ein aufgenommenes Dreieck an der Diagonale; alle anderen Stücke bleiben unverändert. */
export function mirrorPayload(p: ToolPayload): ToolPayload {
  if (p.kind !== 'triangle') return p;
  return { kind: 'triangle', corner: mirrorTriangleCornerDiagonal(p.corner), w: p.d, d: p.w };
}

/** Bounding-Box eines aufgenommenen Stücks in Metern (Viertelkreis: Radius × Radius). */
export function payloadSize(p: ToolPayload): { w: number; d: number } {
  if (p.kind === 'viertelkreis') return { w: QUARTER_CIRCLE_RADIUS_M, d: QUARTER_CIRCLE_RADIUS_M };
  return { w: p.w, d: p.d };
}

/** Macht aus einem aufgenommenen Stück ein platziertes Stück an der Position (x, y). */
export function payloadToFilled(p: ToolPayload, x: number, y: number): FilledPiece {
  if (p.kind === 'piece') return { x, y, w: p.w, d: p.d };
  if (p.kind === 'triangle') return { x, y, w: p.w, d: p.d, corner: p.corner };
  return { x, y, w: QUARTER_CIRCLE_RADIUS_M, d: QUARTER_CIRCLE_RADIUS_M, corner: p.corner, shape: 'viertelkreis' };
}

/** Gleicher Werkzeugtyp und gleiche Maße (Viertelkreis: nur der Typ zählt). */
export function payloadMatches(armed: ToolPayload | null, tile: ToolPayload): boolean {
  if (!armed || armed.kind !== tile.kind) return false;
  if (armed.kind === 'piece' && tile.kind === 'piece') return armed.w === tile.w && armed.d === tile.d;
  if (armed.kind === 'triangle' && tile.kind === 'triangle') return armed.w === tile.w && armed.d === tile.d;
  return true;
}
