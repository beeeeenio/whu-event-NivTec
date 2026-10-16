import { fitsAt, makePieceId, mirrorPieceInPlace, rotatePieceInPlace, type FilledPiece, type Piece2D } from './customShape';

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

/** Prüft, ob die Stücke `ids` gemeinsam um (dx, dy) verschoben werden können. Ausgewählte Stücke stoßen nicht aneinander. */
export function checkGroupMove(pieces: Piece2D[], ids: readonly string[], dx: number, dy: number): GroupMoveCheck {
  const set = new Set(ids);
  const moving = pieces.filter((p) => set.has(p.id));
  if (moving.length === 0) return 'ok';
  if (moving.some((p) => p.x + dx < -1e-6 || p.y + dy < -1e-6)) return 'out-of-bounds';
  const others = pieces.filter((p) => !set.has(p.id));
  return moving.every((p) => fitsAt(others, p.x + dx, p.y + dy, p.w, p.d)) ? 'ok' : 'collision';
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
