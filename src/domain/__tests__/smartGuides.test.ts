import { describe, expect, it } from 'vitest';
import { alignmentGuides, nearestGaps, unionBounds, type AlignmentGuide } from '../smartGuides';

describe('alignmentGuides', () => {
  it('findet Kanten-, Mitten- und Randlinien neben einem Nachbarn', () => {
    const guides: AlignmentGuide[] = alignmentGuides({ x: 2, y: 0, w: 1, d: 1 }, [{ x: 0, y: 0, w: 2, d: 1 }]);

    expect(guides.find((g) => g.axis === 'x' && g.pos === 2 && g.kind === 'edge')).toBeDefined();
    expect(guides.find((g) => g.axis === 'y' && g.pos === 0 && g.kind === 'edge')).toBeDefined();
    expect(guides.find((g) => g.axis === 'y' && g.pos === 1 && g.kind === 'edge')).toBeDefined();
    expect(guides.find((g) => g.axis === 'y' && g.pos === 0.5 && g.kind === 'center')).toBeDefined();
    expect(guides.find((g) => g.axis === 'y' && g.pos === 0 && g.kind === 'border')).toBeDefined();
  });

  it('erzeugt keine Randlinie auf x, wenn das Stück nicht an x=0 anliegt', () => {
    const guides = alignmentGuides({ x: 2, y: 0, w: 1, d: 1 }, [{ x: 0, y: 0, w: 2, d: 1 }]);
    expect(guides.some((g) => g.axis === 'x' && g.kind === 'border')).toBe(false);
  });

  it('die Randlinie y=0 reicht bis zur Unterkante der gemeinsamen Ausdehnung', () => {
    const guides = alignmentGuides({ x: 2, y: 0, w: 1, d: 1 }, [{ x: 0, y: 0, w: 2, d: 1 }]);
    const border = guides.find((g) => g.axis === 'y' && g.kind === 'border');
    expect(border).toEqual({ axis: 'y', pos: 0, kind: 'border', from: 0, to: 3 });
  });

  it('gleiche x-Mitten ergeben eine Mittellinie', () => {
    const guides = alignmentGuides({ x: 0, y: 0, w: 2, d: 1 }, [{ x: 0.5, y: 3, w: 1, d: 1 }]);
    const center = guides.find((g) => g.axis === 'x' && g.pos === 1);
    expect(center?.kind).toBe('center');
    expect(center?.from).toBe(0);
    expect(center?.to).toBe(4);
  });

  it('ohne Übereinstimmung entsteht keine Linie', () => {
    expect(alignmentGuides({ x: 5, y: 5, w: 1, d: 1 }, [{ x: 0, y: 0, w: 2, d: 1 }])).toEqual([]);
  });
});

describe('nearestGaps', () => {
  it('misst die Lücke links zum nächsten Nachbarn', () => {
    const gaps = nearestGaps({ x: 3, y: 0, w: 1, d: 1 }, [{ x: 0, y: 0, w: 2, d: 1 }]);
    const left = gaps.find((g) => g.axis === 'x' && !g.toBorder);
    expect(left).toBeDefined();
    expect(left?.lengthM).toBe(1);
    expect(left?.from).toBe(2);
    expect(left?.to).toBe(3);
    expect(left?.at).toBe(0.5);
  });

  it('ergibt ein Randmaß oben, wenn kein Nachbar darüber liegt', () => {
    const gaps = nearestGaps({ x: 0, y: 0.5, w: 1, d: 1 }, []);
    const top = gaps.find((g) => g.axis === 'y' && g.toBorder);
    expect(top).toEqual({ axis: 'y', from: 0, to: 0.5, at: 0.5, lengthM: 0.5, toBorder: true });
  });

  it('ein Nachbar ohne Querüberlappung zählt nicht', () => {
    const gaps = nearestGaps({ x: 3, y: 0, w: 1, d: 1 }, [{ x: 0, y: 5, w: 2, d: 1 }]);
    expect(gaps.some((g) => g.axis === 'x' && !g.toBorder)).toBe(false);
  });
});

describe('unionBounds', () => {
  it('ergibt für ein leeres Array null', () => {
    expect(unionBounds([])).toBeNull();
  });

  it('ergibt die Hülle zweier Rechtecke', () => {
    expect(
      unionBounds([
        { x: 0, y: 0, w: 2, d: 1 },
        { x: 3, y: 2, w: 1, d: 1 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 4, d: 3 });
  });
});
