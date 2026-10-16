import { describe, it, expect, beforeEach } from 'vitest';
import { addFilledPieces, checkGroupMove, duplicateWithOffset, movePieceTo, movePiecesBy, removePieceById, removePiecesByIds, rotatePieceById } from '../pieceOps';
import type { Piece2D } from '../customShape';

describe('pieceOps', () => {
  let piece1: Piece2D;
  let piece2: Piece2D;
  let pieces: Piece2D[];

  beforeEach(() => {
    piece1 = { id: 'p1', x: 0, y: 0, w: 2, d: 1 };
    piece2 = { id: 'p2', x: 3, y: 2, w: 1, d: 2 };
    pieces = [piece1, piece2];
  });

  describe('addFilledPieces', () => {
    it('appends filled pieces with fresh IDs', () => {
      const filled = [{ x: 5, y: 5, w: 1, d: 1 }];
      const result = addFilledPieces(pieces, filled);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(piece1);
      expect(result[1]).toBe(piece2);
      expect(result[2]).toHaveProperty('id');
      expect(result[2].x).toBe(5);
      expect(result[2].y).toBe(5);
    });

    it('returns the same array reference if filled is empty', () => {
      const result = addFilledPieces(pieces, []);
      expect(result).toBe(pieces);
    });

    it('generates unique IDs for each filled piece', () => {
      const filled = [
        { x: 0, y: 0, w: 1, d: 1 },
        { x: 1, y: 0, w: 1, d: 1 },
      ];
      const result = addFilledPieces(pieces, filled);
      expect(result[2].id).not.toBe(result[3].id);
    });
  });

  describe('removePieceById', () => {
    it('removes a piece by ID', () => {
      const result = removePieceById(pieces, 'p1');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(piece2);
    });

    it('returns the same array reference if ID not found', () => {
      const result = removePieceById(pieces, 'nonexistent');
      expect(result).toBe(pieces);
    });

    it('returns a new array when removing an existing piece', () => {
      const result = removePieceById(pieces, 'p1');
      expect(result).not.toBe(pieces);
    });
  });

  describe('movePieceTo', () => {
    it('moves a piece to a new position', () => {
      const result = movePieceTo(pieces, 'p1', 10, 20);
      expect(result).toHaveLength(2);
      expect(result[0].x).toBe(10);
      expect(result[0].y).toBe(20);
      expect(result[1]).toBe(piece2);
    });

    it('returns the same array reference if ID not found', () => {
      const result = movePieceTo(pieces, 'nonexistent', 10, 20);
      expect(result).toBe(pieces);
    });

    it('returns a new array when moving an existing piece', () => {
      const result = movePieceTo(pieces, 'p1', 10, 20);
      expect(result).not.toBe(pieces);
    });

    it('does not mutate the original piece', () => {
      const originalX = piece1.x;
      movePieceTo(pieces, 'p1', 100, 200);
      expect(piece1.x).toBe(originalX);
    });
  });

  describe('movePieceTo no-op', () => {
    it('returns the same array reference when the piece is already at (x, y)', () => {
      const result = movePieceTo(pieces, 'p1', 0, 0);
      expect(result).toBe(pieces);
    });
  });

  describe('movePiecesBy', () => {
    it('moves all selected pieces by (dx, dy)', () => {
      const result = movePiecesBy(pieces, ['p1'], 1, 0.5);
      expect(result[0].x).toBe(1);
      expect(result[0].y).toBe(0.5);
      expect(result[1]).toBe(piece2);
    });

    it('rounds to 3 decimals', () => {
      const p: Piece2D = { id: 'r', x: 0.1, y: 0, w: 1, d: 1 };
      const list = [p];
      const result = movePiecesBy(list, ['r'], 0.2, 0);
      expect(result[0].x).toBe(0.3);
    });

    it('returns the same array reference when dx and dy are both 0', () => {
      expect(movePiecesBy(pieces, ['p1', 'p2'], 0, 0)).toBe(pieces);
    });

    it('returns the same array reference when no ID matches', () => {
      expect(movePiecesBy(pieces, ['nope'], 1, 1)).toBe(pieces);
    });

    it('keeps corner and shape fields', () => {
      const q: Piece2D = { id: 'q', x: 0, y: 0, w: 1, d: 1, corner: 'tl', shape: 'viertelkreis' };
      const result = movePiecesBy([q], ['q'], 2, 3);
      expect(result[0].corner).toBe('tl');
      expect(result[0].shape).toBe('viertelkreis');
      expect(result[0].x).toBe(2);
      expect(result[0].y).toBe(3);
    });
  });

  describe('removePiecesByIds', () => {
    it('removes all pieces with the given IDs', () => {
      const result = removePiecesByIds(pieces, ['p1', 'p2']);
      expect(result).toHaveLength(0);
    });

    it('returns the same array reference when no ID matches', () => {
      expect(removePiecesByIds(pieces, ['nope'])).toBe(pieces);
    });
  });

  describe('rotatePieceById', () => {
    it('rotates a rectangle piece (swaps w and d)', () => {
      const result = rotatePieceById(pieces, 'p1');
      expect(result).toHaveLength(2);
      expect(result[0].w).toBe(1);
      expect(result[0].d).toBe(2);
      expect(result[1]).toBe(piece2);
    });

    it('returns the same array reference if ID not found', () => {
      const result = rotatePieceById(pieces, 'nonexistent');
      expect(result).toBe(pieces);
    });

    it('returns a new array when rotating an existing piece', () => {
      const result = rotatePieceById(pieces, 'p1');
      expect(result).not.toBe(pieces);
    });

    it('handles triangle pieces with corner property', () => {
      const trianglePiece: Piece2D = { id: 'triangle', x: 0, y: 0, w: 1, d: 1, corner: 'tl' };
      const pieces2 = [trianglePiece];
      const result = rotatePieceById(pieces2, 'triangle');
      expect(result[0].corner).not.toBe('tl');
    });
  });

  describe('reference equality preservation', () => {
    it('preserves array reference when operations are no-ops', () => {
      const r1 = addFilledPieces(pieces, []);
      const r2 = removePieceById(pieces, 'nonexistent');
      const r3 = movePieceTo(pieces, 'nonexistent', 10, 20);
      const r4 = rotatePieceById(pieces, 'nonexistent');
      expect(r1).toBe(pieces);
      expect(r2).toBe(pieces);
      expect(r3).toBe(pieces);
      expect(r4).toBe(pieces);
    });
  });

  describe('checkGroupMove', () => {
    const a: Piece2D = { id: 'a', x: 0, y: 0, w: 2, d: 1 };
    const b: Piece2D = { id: 'b', x: 2, y: 0, w: 2, d: 1 };
    const c: Piece2D = { id: 'c', x: 0, y: 2, w: 2, d: 1 };
    const all = [a, b, c];

    it('erlaubt eine Verschiebung in freien Raum', () => {
      expect(checkGroupMove(all, ['a'], 0, 1)).toBe('ok');
    });

    it('meldet out-of-bounds bei Verschiebung über den linken Rand', () => {
      expect(checkGroupMove(all, ['a'], -0.5, 0)).toBe('out-of-bounds');
    });

    it('meldet collision bei Überlappung mit einem anderen Stück', () => {
      expect(checkGroupMove(all, ['a'], 1, 0)).toBe('collision');
    });

    it('erlaubt gemeinsame Verschiebung, wenn sich die Auswahl nur untereinander berührt', () => {
      expect(checkGroupMove(all, ['a', 'b'], 1, 0)).toBe('ok');
    });

    it('erlaubt Berühren einer Kante ohne Überlappung', () => {
      expect(checkGroupMove(all, ['a'], 0, 1)).toBe('ok');
    });

    it('ist für eine leere Auswahl immer ok', () => {
      expect(checkGroupMove(all, [], 5, 5)).toBe('ok');
    });

    it('meldet out-of-bounds bei einem halben Schritt über den linken Rand (x=0)', () => {
      const single: Piece2D[] = [{ id: 'a', x: 0, y: 0, w: 1, d: 1 }];
      expect(checkGroupMove(single, ['a'], -0.5, 0)).toBe('out-of-bounds');
    });

    it('meldet collision bei einem halben Schritt auf ein Nachbarstück', () => {
      const pair: Piece2D[] = [
        { id: 'a', x: 0, y: 0, w: 1, d: 1 },
        { id: 'b', x: 1, y: 0, w: 1, d: 1 },
      ];
      expect(checkGroupMove(pair, ['a'], 0.5, 0)).toBe('collision');
    });

    it('erlaubt einen Schritt von 1 m auf eine freie Fläche', () => {
      const single: Piece2D[] = [{ id: 'a', x: 0, y: 0, w: 1, d: 1 }];
      expect(checkGroupMove(single, ['a'], 1, 0)).toBe('ok');
    });
  });

  describe('duplicateWithOffset', () => {
    it('kopiert ein Stück um seine Breite nach rechts', () => {
      const pieces: Piece2D[] = [{ id: 'a', x: 0, y: 0, w: 2, d: 1 }];
      const result = duplicateWithOffset(pieces, ['a']);
      expect(result).toEqual([{ x: 2, y: 0, w: 2, d: 1 }]);
    });

    it('springt zur nächsten freien Stelle, wenn rechts belegt ist', () => {
      const pieces: Piece2D[] = [
        { id: 'a', x: 0, y: 0, w: 2, d: 1 },
        { id: 'b', x: 2, y: 0, w: 2, d: 1 },
      ];
      const result = duplicateWithOffset(pieces, ['a']);
      expect(result).toEqual([{ x: 4, y: 0, w: 2, d: 1 }]);
    });

    it('verschiebt eine Mehrfachauswahl als Block mit relativer Anordnung', () => {
      const pieces: Piece2D[] = [
        { id: 'a', x: 0, y: 0, w: 1, d: 1 },
        { id: 'c', x: 0, y: 1, w: 2, d: 1 },
      ];
      const result = duplicateWithOffset(pieces, ['a', 'c']);
      expect(result).toEqual([
        { x: 2, y: 0, w: 1, d: 1 },
        { x: 2, y: 1, w: 2, d: 1 },
      ]);
    });

    it('behält corner bei Dreiecken und setzt keine corner/shape-Schlüssel bei Rechtecken', () => {
      const triangle: Piece2D[] = [{ id: 't', x: 0, y: 0, w: 1, d: 1, corner: 'tl' }];
      const tri = duplicateWithOffset(triangle, ['t']);
      expect(tri![0].corner).toBe('tl');

      const rect: Piece2D[] = [{ id: 'r', x: 0, y: 0, w: 2, d: 1 }];
      const rec = duplicateWithOffset(rect, ['r']);
      expect('corner' in rec![0]).toBe(false);
      expect('shape' in rec![0]).toBe(false);
    });

    it('übernimmt keine id in die Kopie', () => {
      const pieces: Piece2D[] = [{ id: 'a', x: 0, y: 0, w: 2, d: 1 }];
      const result = duplicateWithOffset(pieces, ['a']);
      expect('id' in result![0]).toBe(false);
    });

    it('ergibt null bei leerer Auswahl', () => {
      const pieces: Piece2D[] = [{ id: 'a', x: 0, y: 0, w: 2, d: 1 }];
      expect(duplicateWithOffset(pieces, [])).toBeNull();
    });

    it('ergibt null, wenn innerhalb von maxSteps nichts frei ist', () => {
      const pieces: Piece2D[] = [
        { id: 'a', x: 0, y: 0, w: 2, d: 1 },
        { id: 'b', x: 2, y: 0, w: 2, d: 1 },
      ];
      expect(duplicateWithOffset(pieces, ['a'], 1)).toBeNull();
    });
  });
});
