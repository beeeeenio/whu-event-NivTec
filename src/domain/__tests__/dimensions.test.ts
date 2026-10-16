import { describe, expect, it } from 'vitest';
import { dimensionChains } from '../dimensions';

describe('dimensionChains', () => {
  it('misst ein einzelnes 2×1-Stück: Außenmaß 2 (x) bzw. 1 (y), je ein Segment', () => {
    const chains = dimensionChains([{ x: 0, y: 0, w: 2, d: 1 }]);
    expect(chains).not.toBeNull();
    expect(chains!.x.outer).toEqual({ from: 0, to: 2, lengthM: 2 });
    expect(chains!.x.segments).toEqual([{ from: 0, to: 2, lengthM: 2 }]);
    expect(chains!.y.outer).toEqual({ from: 0, to: 1, lengthM: 1 });
    expect(chains!.y.segments).toEqual([{ from: 0, to: 1, lengthM: 1 }]);
  });

  it('liefert die korrekte Segmentfolge für zwei 2×1 nebeneinander und ein 1×1', () => {
    const chains = dimensionChains([
      { x: 0, y: 0, w: 2, d: 1 },
      { x: 2, y: 0, w: 2, d: 1 },
      { x: 4, y: 0, w: 1, d: 1 },
    ]);
    expect(chains!.x.outer).toEqual({ from: 0, to: 5, lengthM: 5 });
    expect(chains!.x.segments.map((s) => s.lengthM)).toEqual([2, 2, 1]);
    expect(chains!.x.segments.map((s) => [s.from, s.to])).toEqual([
      [0, 2],
      [2, 4],
      [4, 5],
    ]);
    expect(chains!.y.outer.lengthM).toBe(1);
    expect(chains!.y.segments).toHaveLength(1);
  });

  it('dedupliziert gleiche Kanten', () => {
    const chains = dimensionChains([
      { x: 0, y: 0, w: 2, d: 1 },
      { x: 0, y: 0, w: 2, d: 1 },
    ]);
    expect(chains!.x.segments).toEqual([{ from: 0, to: 2, lengthM: 2 }]);
    expect(chains!.y.segments).toEqual([{ from: 0, to: 1, lengthM: 1 }]);
  });

  it('misst bei Versatz ab der Bounding-Box', () => {
    const chains = dimensionChains([{ x: 0.5, y: 0, w: 2, d: 1 }]);
    expect(chains!.x.outer).toEqual({ from: 0.5, to: 2.5, lengthM: 2 });
    expect(chains!.x.segments).toEqual([{ from: 0.5, to: 2.5, lengthM: 2 }]);
  });

  it('liefert für eine leere Liste null', () => {
    expect(dimensionChains([])).toBeNull();
  });

  it('zählt ein Dreieck mit seiner Bounding-Box', () => {
    // Dreieck als Bounding-Box 2×3 (Ecke bei x=0,y=0) plus ein 1×1 rechts oben daneben
    const chains = dimensionChains([
      { x: 0, y: 0, w: 2, d: 3 },
      { x: 3, y: 2, w: 1, d: 1 },
    ]);
    expect(chains!.y.outer).toEqual({ from: 0, to: 3, lengthM: 3 });
    expect(chains!.y.segments.map((s) => s.lengthM)).toEqual([2, 1]);
    expect(chains!.x.outer.lengthM).toBe(4);
  });
});
