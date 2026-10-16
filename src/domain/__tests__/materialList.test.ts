import { describe, expect, it } from 'vitest';
import { buildLayoutFromPieces, type Piece2D } from '../customShape';
import { buildMaterialList } from '../materialList';
import type { RailingSide, TriangleCorner } from '../types';

function piece(id: string, x: number, y: number, w: number, d: number): Piece2D {
  return { id, x, y, w, d };
}

function quarterCircle(id: string, x: number, y: number, corner: TriangleCorner): Piece2D {
  return { id, x, y, w: 1, d: 1, corner, shape: 'viertelkreis' };
}

function triangle2x1(id: string, x: number, y: number, w: number, d: number, corner: TriangleCorner): Piece2D {
  return { id, x, y, w, d, corner };
}

function offset(pieces: Piece2D[], dx: number, dy: number): Piece2D[] {
  return pieces.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

describe('buildMaterialList', () => {
  // 100 cm: Diagonalverstrebung (perimeterbasiert) ist dabei, Geländer ebenfalls — beides hing
  // früher an layout.widthM/depthM, die vom Ursprung aus messen.
  const input = {
    structureType: 'buehne' as const,
    heightCm: 100,
    activeRailingSides: ['vorne', 'links'] as RailingSide[],
  };
  const atOrigin = [piece('a', 0, 0, 2, 1), piece('b', 2, 0, 2, 1), piece('c', 0, 1, 2, 1)];

  it('hängt nicht davon ab, wo die Fläche auf der Zeichenfläche liegt', () => {
    const reference = buildMaterialList({ ...input, layout: buildLayoutFromPieces(atOrigin) });
    const moved = buildMaterialList({ ...input, layout: buildLayoutFromPieces(offset(atOrigin, 1.5, 0.5)) });
    expect(moved).toEqual(reference);
  });

  it('zählt die Diagonalverstrebung aus dem echten Umfang (4×2 m → 6 Stück)', () => {
    const items = buildMaterialList({ ...input, layout: buildLayoutFromPieces(offset(atOrigin, 3, 0)) });
    const diagonal = items.find((i) => i.artikel.startsWith('Diagonalverstrebung'));
    expect(diagonal?.menge).toBe(Math.ceil((2 * (4 + 2)) / 2));
  });

  it('erzeugt einen korrekten Materiallisten-Eintrag für einen Viertelkreis', () => {
    const qc = quarterCircle('qc', 0, 0, 'tl');
    const items = buildMaterialList({ ...input, layout: buildLayoutFromPieces([qc]) });
    const qcItem = items.find((i) => i.artikel.includes('Viertelkreis'));
    expect(qcItem).toBeDefined();
    expect(qcItem?.artikel).toBe('Systempodest, Viertelkreis R 1 m');
    expect(qcItem?.artikelNr).toBeUndefined();
    expect(qcItem?.menge).toBe(1);
  });

  it('zählt linke und rechte 2×1-Dreiecke separat auf (Phase 6)', () => {
    const items = buildMaterialList({
      ...input,
      layout: buildLayoutFromPieces([
        triangle2x1('a', 0, 0, 2, 1, 'tl'),  // rechts
        triangle2x1('b', 2, 0, 2, 1, 'tr'),  // links
        triangle2x1('c', 4, 0, 2, 1, 'tl'),  // rechts
      ]),
    });
    const leftItem = items.find((i) => i.artikel.includes('links'));
    const rightItem = items.find((i) => i.artikel.includes('rechts'));
    expect(leftItem?.menge).toBe(1);
    expect(rightItem?.menge).toBe(2);
  });

  it('komplettes Katalog-Set: alle 13 Rechtecke + 3 Dreieck-Varianten + 1 Viertelkreis → 17 PLATTEN ohne NaN', () => {
    // Alle 13 Rechteck-Größen aus RECT_CATALOG
    const rectPieces: Piece2D[] = [
      piece('r1', 0, 0, 2, 1),
      piece('r2', 2, 0, 2, 0.75),
      piece('r3', 4, 0, 2, 0.5),
      piece('r4', 6, 0, 2, 0.39),
      piece('r5', 0, 1, 1.5, 1),
      piece('r6', 1.5, 1, 1.5, 0.75),
      piece('r7', 3, 1, 1.5, 0.5),
      piece('r8', 4.5, 1, 1.5, 0.39),
      piece('r9', 0, 2, 1, 1),
      piece('r10', 1, 2, 1, 0.75),
      piece('r11', 2, 2, 1, 0.5),
      piece('r12', 3, 2, 1, 0.39),
      piece('r13', 4, 2, 0.5, 0.5),
    ];
    // 3 Dreieck-Varianten: 1×1, 2×1-links, 2×1-rechts
    const triPieces: Piece2D[] = [
      { id: 't1', x: 0, y: 3, w: 1, d: 1, corner: 'tl' },
      triangle2x1('t2', 1, 3, 2, 1, 'tl'),  // 2×1-rechts
      triangle2x1('t3', 3, 3, 2, 1, 'tr'),  // 2×1-links
    ];
    // 1 Viertelkreis
    const qcPieces: Piece2D[] = [quarterCircle('qc', 5, 3, 'tl')];

    const allPieces = [...rectPieces, ...triPieces, ...qcPieces];
    const items = buildMaterialList({
      ...input,
      layout: buildLayoutFromPieces(allPieces),
    });

    // Filtern auf PLATTEN (diese haben 'Systempodest' im artikel)
    const plattItems = items.filter((i) => i.artikel.includes('Systempodest'));
    expect(plattItems).toHaveLength(17);

    // Prüfe: keine NaN-Werte in artikel-Feld
    plattItems.forEach((item) => {
      expect(item.artikel).not.toMatch(/NaN/i);
    });
  });

  it('vergibt die Katalog-Artikelnummern für 2×1 (111 01 0) und 1×1 (111 05 0) Rechtecke', () => {
    const items = buildMaterialList({
      ...input,
      layout: buildLayoutFromPieces([piece('a', 0, 0, 2, 1), piece('b', 0, 1, 1, 1)]),
    });
    expect(items.find((i) => i.artikel === 'Systempodest 2×1 m')?.artikelNr).toBe('111 01 0');
    expect(items.find((i) => i.artikel === 'Systempodest 1×1 m')?.artikelNr).toBe('111 05 0');
  });
});
