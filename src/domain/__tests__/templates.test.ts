import { describe, expect, it } from 'vitest';
import { boundingBoxOf, fitsAllAt, type FilledPiece, type Piece2D } from '../customShape';
import { isCatalogRect } from '../panels';
import { STAGE_TEMPLATES, TRESEN_TEMPLATES } from '../templates';
import { isValidPieceGeometry } from '../savedState';

/** Prüft eine Ebene Stück für Stück: jedes Stück gültig, Katalogmaß und überlappungsfrei gegen alle vorherigen. */
function expectLayerValid(pieces: FilledPiece[]) {
  const placed: Piece2D[] = [];
  pieces.forEach((p, i) => {
    expect(isValidPieceGeometry(p)).toBe(true);
    expect(isCatalogRect(p.w, p.d)).toBe(true);
    expect(fitsAllAt(placed, [p])).toBe(true);
    placed.push({ ...p, id: `dummy-${i}` });
  });
}

function area(pieces: FilledPiece[]): number {
  return pieces.reduce((sum, p) => sum + p.w * p.d, 0);
}

describe('STAGE_TEMPLATES', () => {
  it('hat eindeutige IDs', () => {
    const ids = STAGE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(STAGE_TEMPLATES.map((t) => [t.id, t] as const))('%s ist überlappungsfrei aus Katalogstücken', (_id, t) => {
    expectLayerValid(t.build());
  });

  it('Bühne 4×3 m: Bounding-Box und lückenlose Fläche', () => {
    const pieces = STAGE_TEMPLATES.find((t) => t.id === 'b-4x3')!.build();
    expect(boundingBoxOf(pieces)).toEqual({ x: 0, y: 0, widthM: 4, depthM: 3 });
    expect(area(pieces)).toBeCloseTo(12, 6);
  });

  it('Bühne 6×4 m: Bounding-Box und lückenlose Fläche', () => {
    const pieces = STAGE_TEMPLATES.find((t) => t.id === 'b-6x4')!.build();
    expect(boundingBoxOf(pieces)).toEqual({ x: 0, y: 0, widthM: 6, depthM: 4 });
    expect(area(pieces)).toBeCloseTo(24, 6);
  });

  it('Bühne 8×4 m: Bounding-Box und lückenlose Fläche', () => {
    const pieces = STAGE_TEMPLATES.find((t) => t.id === 'b-8x4')!.build();
    expect(boundingBoxOf(pieces)).toEqual({ x: 0, y: 0, widthM: 8, depthM: 4 });
    expect(area(pieces)).toBeCloseTo(32, 6);
  });

  it('T-Steg: Bounding-Box 6×7 m, Fläche = Bühne 6×3 + Steg 2×4', () => {
    const pieces = STAGE_TEMPLATES.find((t) => t.id === 't-steg')!.build();
    expect(boundingBoxOf(pieces)).toEqual({ x: 0, y: 0, widthM: 6, depthM: 7 });
    expect(area(pieces)).toBeCloseTo(18 + 8, 6);
  });

  it('Laufsteg 2×8 m: Bounding-Box', () => {
    const pieces = STAGE_TEMPLATES.find((t) => t.id === 'laufsteg')!.build();
    expect(boundingBoxOf(pieces)).toEqual({ x: 0, y: 0, widthM: 2, depthM: 8 });
    expect(area(pieces)).toBeCloseTo(16, 6);
  });
});

describe('TRESEN_TEMPLATES', () => {
  it('hat eindeutige IDs und genau drei Vorlagen', () => {
    const ids = TRESEN_TEMPLATES.map((t) => t.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TRESEN_TEMPLATES.map((t) => [t.id, t] as const))('%s: jede Ebene ist überlappungsfrei aus Katalogstücken', (_id, t) => {
    const { base, top } = t.build();
    expect(base.length).toBeGreaterThan(0);
    expect(top.length).toBeGreaterThan(0);
    expectLayerValid(base);
    expectLayerValid(top);
  });

  it('Tresen gerade: Unterbau 4×1 m, Platte 4×0,5 m', () => {
    const { base, top } = TRESEN_TEMPLATES.find((t) => t.id === 'tresen-gerade')!.build();
    expect(boundingBoxOf(base)).toEqual({ x: 0, y: 0, widthM: 4, depthM: 1 });
    expect(boundingBoxOf(top)).toEqual({ x: 0, y: 0, widthM: 4, depthM: 0.5 });
  });

  it('Tresen L: Unterbau 4×3 m, Platte 4×3 m', () => {
    const { base, top } = TRESEN_TEMPLATES.find((t) => t.id === 'tresen-l')!.build();
    expect(boundingBoxOf(base)).toEqual({ x: 0, y: 0, widthM: 4, depthM: 3 });
    expect(boundingBoxOf(top)).toEqual({ x: 0, y: 0, widthM: 4, depthM: 3 });
  });

  it('Tresen U: Unterbau und Platte je 4×3 m, Schenkel links und rechts', () => {
    const { base, top } = TRESEN_TEMPLATES.find((t) => t.id === 'tresen-u')!.build();
    expect(boundingBoxOf(base)).toEqual({ x: 0, y: 0, widthM: 4, depthM: 3 });
    expect(boundingBoxOf(top)).toEqual({ x: 0, y: 0, widthM: 4, depthM: 3 });
    // Linker Schenkel: Unterbau bei x=0, Platte bei x=0..0,5
    expect(base.some((p) => p.x === 0 && p.y >= 1)).toBe(true);
    expect(top.some((p) => p.x === 0 && p.y >= 0.5)).toBe(true);
  });
});
