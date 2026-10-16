import { describe, it, expect, beforeEach } from 'vitest';
import { addFilledPieces, checkGroupMove, duplicateWithOffset, moveGroupTo, movePieceTo, movePiecesBy, piecesInRect, removePieceById, removePiecesByIds, rotateGroupAroundCenter, rotatePieceAroundCenter, rotatePieceById, snapGroupDelta } from '../pieceOps';
import { fitsAt, type Piece2D } from '../customShape';

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

describe('Kanten-Snapping und Drehen um den Mittelpunkt', () => {
  describe('snapGroupDelta', () => {
    it('rastet an der Nachbarkante, wenn sie innerhalb der Toleranz liegt', () => {
      // Nachbar bei x=3,3 → Gruppe (x=0..1) soll bei 2,3 bündig anliegen (Anfang an Ende)
      const pieces: Piece2D[] = [
        { id: 'm', x: 0, y: 0, w: 1, d: 1 },
        { id: 'n', x: 3.3, y: 0, w: 1, d: 1 },
      ];
      expect(snapGroupDelta(pieces, ['m'], 2.35, 0, 0.1)).toEqual({ dx: 2.3, dy: 0 });
    });

    it('rastet außerhalb der Toleranz aufs 0,5-m-Raster', () => {
      const pieces: Piece2D[] = [
        { id: 'm', x: 0, y: 0, w: 1, d: 1 },
        { id: 'n', x: 3.3, y: 0, w: 1, d: 1 },
      ];
      expect(snapGroupDelta(pieces, ['m'], 2.1, 0, 0.1)).toEqual({ dx: 2, dy: 0 });
    });

    it('klemmt so, dass die Auswahl nicht links von x=0 wandert', () => {
      const pieces: Piece2D[] = [
        { id: 'm', x: 1, y: 0, w: 1, d: 1 },
        { id: 'n', x: 3.3, y: 0, w: 1, d: 1 },
      ];
      expect(snapGroupDelta(pieces, ['m'], -1.5, 0, 0.1).dx).toBe(-1);
    });

    it('rastet auch in y an Nachbarkanten', () => {
      const pieces: Piece2D[] = [
        { id: 'm', x: 0, y: 0, w: 1, d: 1 },
        { id: 'n', x: 5, y: 2.7, w: 1, d: 1 },
      ];
      expect(snapGroupDelta(pieces, ['m'], 0, 1.75, 0.1).dy).toBe(1.7);
    });

    it('liefert {0,0} bei leerer Auswahl', () => {
      expect(snapGroupDelta([], [], 3, 3, 0.1)).toEqual({ dx: 0, dy: 0 });
    });
  });

  describe('rotatePieceAroundCenter', () => {
    it('dreht ein 2×1 bei (0,2) um seine Mitte zu 1×2 bei (0,5;1,5)', () => {
      const pieces: Piece2D[] = [{ id: 'a', x: 0, y: 2, w: 2, d: 1 }];
      const [r] = rotatePieceAroundCenter(pieces, 'a');
      expect(r.w).toBe(1);
      expect(r.d).toBe(2);
      expect(r.x).toBe(0.5);
      expect(r.y).toBe(1.5);
    });

    it('rückt nach, wenn das gedrehte Stück an der Mitte kollidiert', () => {
      const pieces: Piece2D[] = [
        { id: 'a', x: 0, y: 2, w: 2, d: 1 },
        { id: 'b', x: 0.5, y: 1, w: 1, d: 2 },
      ];
      const result = rotatePieceAroundCenter(pieces, 'a');
      const a = result.find((p) => p.id === 'a')!;
      expect(a.w).toBe(1);
      expect(a.d).toBe(2);
      expect(fitsAt([pieces[1]], a.x, a.y, a.w, a.d)).toBe(true);
    });

    it('dreht ein quadratisches Dreieck an Ort und Stelle (nur die Ecke wechselt)', () => {
      const pieces: Piece2D[] = [{ id: 't', x: 1, y: 1, w: 1, d: 1, corner: 'tl' }];
      const [r] = rotatePieceAroundCenter(pieces, 't');
      expect(r.corner).not.toBe('tl');
      expect([r.x, r.y, r.w, r.d]).toEqual([1, 1, 1, 1]);
    });

    it('weicht Blockern aus und nimmt sie nicht ins Ergebnis auf', () => {
      const pieces: Piece2D[] = [{ id: 'a', x: 0, y: 2, w: 2, d: 1 }];
      const blockers: Piece2D[] = [{ id: 'blk', x: 0.5, y: 1.5, w: 1, d: 2 }];
      const result = rotatePieceAroundCenter(pieces, 'a', undefined, blockers);
      expect(result).toHaveLength(1);
      expect(result.some((p) => p.id === 'blk')).toBe(false);
      const a = result[0];
      expect(a.w).toBe(1);
      expect(a.d).toBe(2);
      expect(fitsAt(blockers, a.x, a.y, a.w, a.d)).toBe(true);
    });

    it('gibt die Liste unverändert zurück, wenn die ID fehlt', () => {
      const pieces: Piece2D[] = [{ id: 'a', x: 0, y: 2, w: 2, d: 1 }];
      expect(rotatePieceAroundCenter(pieces, 'nope')).toBe(pieces);
    });
  });

  describe('rotateGroupAroundCenter', () => {
    it('dreht zwei 2×1 als Block um die Mitte zu zwei 1×2 bei x=1,5 mit y=0 und y=2', () => {
      const pieces: Piece2D[] = [
        { id: 'a', x: 0, y: 0, w: 2, d: 1 },
        { id: 'b', x: 2, y: 0, w: 2, d: 1 },
      ];
      const result = rotateGroupAroundCenter(pieces, ['a', 'b']);
      expect(result).not.toBeNull();
      const [a, b] = result!;
      expect([a.id, a.w, a.d, a.x, a.y]).toEqual(['a', 1, 2, 1.5, 0]);
      expect([b.id, b.w, b.d, b.x, b.y]).toEqual(['b', 1, 2, 1.5, 2]);
    });

    it('gibt null zurück, wenn der gedrehte Block ein drittes Stück trifft', () => {
      const pieces: Piece2D[] = [
        { id: 'a', x: 0, y: 0, w: 2, d: 1 },
        { id: 'b', x: 2, y: 0, w: 2, d: 1 },
        { id: 'c', x: 1, y: 2.5, w: 1, d: 1 },
      ];
      expect(rotateGroupAroundCenter(pieces, ['a', 'b'])).toBeNull();
    });
  });

  describe('piecesInRect', () => {
    const grid: Piece2D[] = [
      { id: 'a', x: 0, y: 0, w: 2, d: 1 },
      { id: 'b', x: 2, y: 0, w: 2, d: 1 },
      { id: 'c', x: 0, y: 1, w: 1, d: 1 },
    ];

    it('intersect wählt auch teilweise überlappte Stücke, contain nur vollständig enthaltene', () => {
      const rect = { x: 1, y: 0, w: 1.5, d: 1.5 };
      expect(piecesInRect(grid, rect, 'intersect')).toEqual(['a', 'b']);
      expect(piecesInRect(grid, rect, 'contain')).toEqual([]);
    });

    it('contain wählt vollständig enthaltene Stücke aus', () => {
      // x -0.5..3.5, y -0.5..2.5: a und c liegen ganz drin, b ragt rechts heraus.
      const rect = { x: -0.5, y: -0.5, w: 4, d: 3 };
      expect(piecesInRect(grid, rect, 'contain')).toEqual(['a', 'c']);
      expect(piecesInRect(grid, { x: -0.5, y: -0.5, w: 5, d: 3 }, 'contain')).toEqual(['a', 'b', 'c']);
    });

    it('intersect ist der Standardmodus', () => {
      const rect = { x: 0.5, y: 0.5, w: 0.2, d: 0.2 };
      expect(piecesInRect(grid, rect)).toEqual(['a']);
    });

    it('normalisiert einen negativen Rahmen (von rechts unten aufgezogen)', () => {
      const forward = { x: 0.5, y: 0.2, w: 2, d: 1.5 };
      const backward = { x: 2.5, y: 1.7, w: -2, d: -1.5 };
      expect(piecesInRect(grid, backward)).toEqual(piecesInRect(grid, forward));
      expect(piecesInRect(grid, backward)).toEqual(['a', 'b', 'c']);
      // von (4.5, 1.5) nach links oben aufgezogen: x 1.5..4.5, y -0.5..1.5 -> nur b liegt ganz drin
      expect(piecesInRect(grid, { x: 4.5, y: 1.5, w: -3, d: -2 }, 'contain')).toEqual(['b']);
    });

    it('zählt bloßes Kantenberühren bei intersect nicht', () => {
      // x 1..2: a wird überlappt, b berührt nur die Kante x=2, c berührt nur die Kante x=1.
      expect(piecesInRect(grid, { x: 1, y: 0, w: 1, d: 1 }, 'intersect')).toEqual(['a']);
      // Rahmen direkt unter c (y 2..3) berührt nur dessen untere Kante.
      expect(piecesInRect(grid, { x: 0, y: 2, w: 2, d: 1 }, 'intersect')).toEqual([]);
      // Rahmen rechts neben allen Stücken (x 4..5) berührt nur die rechte Kante von b.
      expect(piecesInRect(grid, { x: 4, y: 0, w: 1, d: 1 }, 'intersect')).toEqual([]);
    });

    it('liefert bei einem leeren Rahmen []', () => {
      expect(piecesInRect(grid, { x: 0.5, y: 0.5, w: 0, d: 0.5 })).toEqual([]);
      expect(piecesInRect(grid, { x: 0.5, y: 0.5, w: 1, d: 0 }, 'contain')).toEqual([]);
      expect(piecesInRect([], { x: 0, y: 0, w: 5, d: 5 })).toEqual([]);
    });
  });

  describe('moveGroupTo', () => {
    // Auswahl a (1..3 / 1..2) und c (3..4 / 3..4); b steht weit weg bei (5,5).
    const a: Piece2D = { id: 'a', x: 1, y: 1, w: 2, d: 1 };
    const c: Piece2D = { id: 'c', x: 3, y: 3, w: 1, d: 1 };
    const b: Piece2D = { id: 'b', x: 5, y: 5, w: 1, d: 1 };

    it('rundet das Ziel aufs Raster (1,3 → 1,5)', () => {
      const r = moveGroupTo([a], ['a'], 1.3, 2.2);
      expect(r.dx).toBe(0.5);
      expect(r.dy).toBe(1);
      expect(r.result).toBe('ok');
    });

    it('klemmt negative Ziele auf 0', () => {
      const r = moveGroupTo([a], ['a'], -2, -3);
      expect(r.dx).toBe(-1);
      expect(r.dy).toBe(-1);
      expect(r.result).toBe('ok');
    });

    it('meldet collision bei Überlappung mit einem anderen Stück', () => {
      // Ziel (4.5, 5): a läge bei x 4.5..6.5, y 5..6 und überlappt b (5..6, 5..6).
      const r = moveGroupTo([a, b], ['a'], 4.5, 5);
      expect(r.result).toBe('collision');
    });

    it('meldet ok an einer freien Stelle', () => {
      const r = moveGroupTo([a, b], ['a'], 0, 0);
      expect(r.result).toBe('ok');
    });

    it('rechnet relativ zur Bounding-Box der Auswahl', () => {
      // Bounding-Box von a und c beginnt bei (1, 1); Ziel (2, 4) setzt die linke obere Ecke dorthin.
      const r = moveGroupTo([a, c], ['a', 'c'], 2, 4);
      expect(r).toEqual({ dx: 1, dy: 3, result: 'ok' });
    });

    it('liefert ohne Auswahl einen Nullversatz', () => {
      expect(moveGroupTo([a, b], [], 2, 2)).toEqual({ dx: 0, dy: 0, result: 'ok' });
    });
  });
});
