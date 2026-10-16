import { describe, expect, it } from 'vitest';
import { nextTriangleCorner, phantomCorner, quarterCirclePath, triangleHand, trianglePoints } from '../triangle';
import type { TriangleCorner } from '../types';

describe('phantomCorner', () => {
  it('liefert die diagonal gegenüberliegende Ecke für jede der 4 Ausrichtungen', () => {
    expect(phantomCorner('tl')).toBe('br');
    expect(phantomCorner('tr')).toBe('bl');
    expect(phantomCorner('bl')).toBe('tr');
    expect(phantomCorner('br')).toBe('tl');
  });
});

describe('trianglePoints', () => {
  const piece = { x: 0, y: 0, w: 2, d: 3 };

  it('liefert die 3 echten Eckpunkte je Ausrichtung, ohne die Phantom-Ecke', () => {
    expect(trianglePoints(piece, 'tl')).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 3 }]);
    expect(trianglePoints(piece, 'tr')).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }]);
    expect(trianglePoints(piece, 'bl')).toEqual([{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 2, y: 3 }]);
    expect(trianglePoints(piece, 'br')).toEqual([{ x: 2, y: 0 }, { x: 0, y: 3 }, { x: 2, y: 3 }]);
  });

  it('verschiebt die Punkte korrekt für ein Stück, das nicht am Ursprung liegt', () => {
    expect(trianglePoints({ x: 5, y: 4, w: 1, d: 1 }, 'tl')).toEqual([
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 5, y: 5 },
    ]);
  });
});

describe('nextTriangleCorner', () => {
  it('rotiert im Uhrzeigersinn: tl→tr→br→bl→tl', () => {
    expect(nextTriangleCorner('tl')).toBe('tr');
    expect(nextTriangleCorner('tr')).toBe('br');
    expect(nextTriangleCorner('br')).toBe('bl');
    expect(nextTriangleCorner('bl')).toBe('tl');
  });

  it('kommt nach genau 4 Schritten wieder beim Ausgangspunkt an, für jede Startecke', () => {
    const corners: TriangleCorner[] = ['tl', 'tr', 'bl', 'br'];
    for (const start of corners) {
      let c = start;
      for (let i = 0; i < 4; i++) c = nextTriangleCorner(c);
      expect(c).toBe(start);
    }
  });
});

describe('quarterCirclePath', () => {
  // Viertelkreis mit Radius 1m, Bounding-Box 1×1 m
  const piece = { x: 0, y: 0, w: 1, d: 1 };

  it('generiert einen SVG-Pfad für corner=tl (Mittelpunkt oben-links, Bogen nach unten-rechts)', () => {
    // corner=tl: Mittelpunkt (0,0), Endpunkte (1,0) und (0,1)
    const path = quarterCirclePath(piece, 'tl');
    expect(path).toBe('M 0 0 L 1 0 A 1 1 0 0 1 0 1 Z');
  });

  it('generiert einen SVG-Pfad für corner=tr (Mittelpunkt oben-rechts, Bogen nach unten-links)', () => {
    // corner=tr: Mittelpunkt (1,0), Endpunkte (0,0) und (1,1)
    const path = quarterCirclePath(piece, 'tr');
    expect(path).toBe('M 1 0 L 0 0 A 1 1 0 0 0 1 1 Z');
  });

  it('generiert einen SVG-Pfad für corner=bl (Mittelpunkt unten-links, Bogen nach oben-rechts)', () => {
    // corner=bl: Mittelpunkt (0,1), Endpunkte (0,0) und (1,1)
    const path = quarterCirclePath(piece, 'bl');
    expect(path).toBe('M 0 1 L 0 0 A 1 1 0 0 1 1 1 Z');
  });

  it('generiert einen SVG-Pfad für corner=br (Mittelpunkt unten-rechts, Bogen nach oben-links)', () => {
    // corner=br: Mittelpunkt (1,1), Endpunkte (1,0) und (0,1)
    const path = quarterCirclePath(piece, 'br');
    expect(path).toBe('M 1 1 L 1 0 A 1 1 0 0 0 0 1 Z');
  });

  it('wölbt den Bogen bei jeder Ecke nach außen (Bogenmitte liegt in der Bounding-Box)', () => {
    // Bogen mit Mittelpunkt c: Bogenmitte = c + r·(normierte Winkelhalbierende) — muss im 1×1-Feld liegen.
    // Mit falschem sweep-flag läge der Bogen um die Phantom-Ecke (nach innen gewölbt).
    for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
      const m = /M (\S+) (\S+) L (\S+) (\S+) A 1 1 0 0 (\d) (\S+) (\S+) Z/.exec(quarterCirclePath(piece, corner))!;
      const [cx, cy, ax, ay, sweep, bx, by] = m.slice(1).map(Number);
      const cross = (ax - cx) * (by - cy) - (ay - cy) * (bx - cx);
      expect(sweep).toBe(cross > 0 ? 1 : 0);
    }
  });

  it('verschiebt den Pfad korrekt für ein Stück, das nicht am Ursprung liegt', () => {
    const offsetPiece = { x: 5, y: 4, w: 1, d: 1 };
    const path = quarterCirclePath(offsetPiece, 'tl');
    expect(path).toBe('M 5 4 L 6 4 A 1 1 0 0 1 5 5 Z');
  });
});

describe('triangleHand — 2×1 Dreiecke', () => {
  it('rechts = (diagonale Ecke AND wide) OR (off-diagonal AND narrow)', () => {
    // tl (diagonal), 2×1 (wide) → rechts
    expect(triangleHand('tl', 2, 1)).toBe('rechts');
    // tr (off-diagonal), 1×2 (narrow) → rechts (nach einer Rotation von oben)
    expect(triangleHand('tr', 1, 2)).toBe('rechts');
    // br (diagonal), 2×1 (wide) → rechts (nach zwei Rotationen)
    expect(triangleHand('br', 2, 1)).toBe('rechts');
  });

  it('links = (diagonale Ecke AND narrow) OR (off-diagonal AND wide)', () => {
    expect(triangleHand('tl', 1, 2)).toBe('links');
    expect(triangleHand('tr', 2, 1)).toBe('links');
    expect(triangleHand('bl', 2, 1)).toBe('links');
  });

  it('1×1 Dreiecke: Händigkeit hängt nur vom corner ab (da w === d)', () => {
    // Für 1×1 ist w === d, also isWide=false. Die Händigkeit hängt davon ab, ob corner auf Diagonale liegt
    expect(triangleHand('tl', 1, 1)).toBe('links'); // onDiagonal=true, isWide=false → false
    expect(triangleHand('tr', 1, 1)).toBe('rechts'); // onDiagonal=false, isWide=false → true
    expect(triangleHand('bl', 1, 1)).toBe('rechts'); // onDiagonal=false, isWide=false → true
    expect(triangleHand('br', 1, 1)).toBe('links'); // onDiagonal=true, isWide=false → false
  });

  it('Rotation eines 2×1-Dreiecks erhält die Händigkeit nach einem vollen Zyklus', () => {
    // Starte mit 'rechts' bei corner=tl, w=2, d=1
    let corner: TriangleCorner = 'tl';
    let w = 2;
    let d = 1;
    const startHand = triangleHand(corner, w, d);

    // 4 rotationen: each rotation changes corner and swaps w/d
    for (let i = 0; i < 4; i++) {
      corner = nextTriangleCorner(corner);
      [w, d] = [d, w];
    }
    expect(triangleHand(corner, w, d)).toBe(startHand);
  });
});
