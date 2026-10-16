import { describe, expect, it } from 'vitest';
import { mirrorPayload, payloadMatches, payloadSize, payloadToFilled, payloadToFilledPieces, rotatePayload, type ToolPayload } from '../toolPayload';

describe('rotatePayload', () => {
  it('dreht ein Rechteck: Breite und Tiefe tauschen', () => {
    const p: ToolPayload = { kind: 'piece', w: 2, d: 1 };
    expect(rotatePayload(p)).toEqual({ kind: 'piece', w: 1, d: 2 });
  });

  it('ist bei zweimaliger Drehung eines Rechtecks wieder der Ausgangszustand', () => {
    const p: ToolPayload = { kind: 'piece', w: 2, d: 1 };
    expect(rotatePayload(rotatePayload(p))).toEqual(p);
  });

  it('dreht ein Dreieck tl 2×1 zu tr 1×2', () => {
    const p: ToolPayload = { kind: 'triangle', corner: 'tl', w: 2, d: 1 };
    expect(rotatePayload(p)).toEqual({ kind: 'triangle', corner: 'tr', w: 1, d: 2 });
  });

  it('dreht einen Viertelkreis viermal zurück in die Ausgangsecke', () => {
    let p: ToolPayload = { kind: 'viertelkreis', corner: 'tl' };
    for (let i = 0; i < 4; i++) p = rotatePayload(p);
    expect(p).toEqual({ kind: 'viertelkreis', corner: 'tl' });
  });
});

describe('mirrorPayload', () => {
  it('lässt ein Rechteck unverändert', () => {
    const p: ToolPayload = { kind: 'piece', w: 2, d: 1 };
    expect(mirrorPayload(p)).toEqual(p);
  });

  it('spiegelt ein Dreieck an der Diagonale: tr 2×1 wird bl 1×2', () => {
    const p: ToolPayload = { kind: 'triangle', corner: 'tr', w: 2, d: 1 };
    expect(mirrorPayload(p)).toEqual({ kind: 'triangle', corner: 'bl', w: 1, d: 2 });
  });
});

describe('payloadSize', () => {
  it('liefert für den Viertelkreis Radius × Radius (1×1)', () => {
    expect(payloadSize({ kind: 'viertelkreis', corner: 'br' })).toEqual({ w: 1, d: 1 });
  });

  it('liefert für Rechteck und Dreieck die gespeicherten Maße', () => {
    expect(payloadSize({ kind: 'piece', w: 2, d: 1 })).toEqual({ w: 2, d: 1 });
    expect(payloadSize({ kind: 'triangle', corner: 'tl', w: 2, d: 1 })).toEqual({ w: 2, d: 1 });
  });
});

describe('payloadToFilled', () => {
  it('setzt Position und Maße eines Rechtecks ohne Ecke', () => {
    const f = payloadToFilled({ kind: 'piece', w: 2, d: 1 }, 3, 4);
    expect(f).toEqual({ x: 3, y: 4, w: 2, d: 1 });
    expect(f.corner).toBeUndefined();
  });

  it('übernimmt die Ecke beim Dreieck', () => {
    expect(payloadToFilled({ kind: 'triangle', corner: 'br', w: 1, d: 1 }, 0, 0)).toEqual({ x: 0, y: 0, w: 1, d: 1, corner: 'br' });
  });

  it('erzeugt beim Viertelkreis Ecke und shape viertelkreis mit w = d = Radius', () => {
    const f = payloadToFilled({ kind: 'viertelkreis', corner: 'tr' }, 5, 6);
    expect(f).toEqual({ x: 5, y: 6, w: 1, d: 1, corner: 'tr', shape: 'viertelkreis' });
  });
});

describe('payloadMatches', () => {
  it('ist ohne Bewaffnung immer falsch', () => {
    expect(payloadMatches(null, { kind: 'piece', w: 1, d: 1 })).toBe(false);
  });

  it('vergleicht Rechtecke über Breite und Tiefe', () => {
    expect(payloadMatches({ kind: 'piece', w: 2, d: 1 }, { kind: 'piece', w: 2, d: 1 })).toBe(true);
    expect(payloadMatches({ kind: 'piece', w: 1, d: 2 }, { kind: 'piece', w: 2, d: 1 })).toBe(false);
  });

  it('vergleicht Dreiecke über Maße, nicht über die Ecke', () => {
    expect(payloadMatches({ kind: 'triangle', corner: 'tr', w: 2, d: 1 }, { kind: 'triangle', corner: 'tl', w: 2, d: 1 })).toBe(true);
  });

  it('gilt für Viertelkreise, sobald der Typ passt', () => {
    expect(payloadMatches({ kind: 'viertelkreis', corner: 'bl' }, { kind: 'viertelkreis', corner: 'tl' })).toBe(true);
  });

  it('unterscheidet verschiedene Typen', () => {
    expect(payloadMatches({ kind: 'piece', w: 1, d: 1 }, { kind: 'triangle', corner: 'tl', w: 1, d: 1 })).toBe(false);
  });
});

describe('Baustein (kind block)', () => {
  // Zwei 2×1-Platten nebeneinander, auf (0,0) normalisiert: Box 4×1.
  const pair: ToolPayload = {
    kind: 'block',
    label: 'Paar',
    pieces: [
      { x: 0, y: 0, w: 2, d: 1 },
      { x: 2, y: 0, w: 2, d: 1 },
    ],
  };

  it('liefert als payloadSize die Bounding-Box aller Stücke', () => {
    expect(payloadSize(pair)).toEqual({ w: 4, d: 1 });
  });

  it('dreht zwei nebeneinanderliegende 2×1 zu zwei 1×2 übereinander, normalisiert auf (0,0)', () => {
    const r = rotatePayload(pair);
    expect(r.kind).toBe('block');
    if (r.kind !== 'block') return;
    expect(r.label).toBe('Paar');
    expect(r.pieces).toEqual([
      { x: 0, y: 0, w: 1, d: 2 },
      { x: 0, y: 2, w: 1, d: 2 },
    ]);
    expect(payloadSize(r)).toEqual({ w: 1, d: 4 });
  });

  it('ist nach viermaliger Drehung wieder der Ausgangsblock', () => {
    let p: ToolPayload = pair;
    for (let i = 0; i < 4; i++) p = rotatePayload(p);
    expect(p).toEqual(pair);
  });

  it('dreht Ecken-Stücke im Block mit (Ecke weiterdrehen, Maße tauschen)', () => {
    const tri: ToolPayload = { kind: 'block', label: 'Dreieck', pieces: [{ x: 0, y: 0, w: 1, d: 1, corner: 'tl' }] };
    const r = rotatePayload(tri);
    if (r.kind !== 'block') throw new Error('kein Block');
    expect(r.pieces).toEqual([{ x: 0, y: 0, w: 1, d: 1, corner: 'tr' }]);
  });

  it('lässt einen Block beim Spiegeln unverändert', () => {
    expect(mirrorPayload(pair)).toEqual(pair);
  });

  it('payloadToFilledPieces verschiebt alle Stücke um (x, y)', () => {
    expect(payloadToFilledPieces(pair, 3, 5)).toEqual([
      { x: 3, y: 5, w: 2, d: 1 },
      { x: 5, y: 5, w: 2, d: 1 },
    ]);
  });

  it('payloadToFilledPieces liefert für Einzelarten genau ein Stück', () => {
    expect(payloadToFilledPieces({ kind: 'piece', w: 2, d: 1 }, 1, 2)).toEqual([{ x: 1, y: 2, w: 2, d: 1 }]);
  });

  it('vergleicht Bausteine über Name und Stückzahl', () => {
    expect(payloadMatches(pair, { ...pair })).toBe(true);
    expect(payloadMatches(pair, { kind: 'block', label: 'Anders', pieces: pair.kind === 'block' ? pair.pieces : [] })).toBe(false);
    expect(payloadMatches(pair, { kind: 'block', label: 'Paar', pieces: [{ x: 0, y: 0, w: 1, d: 1 }] })).toBe(false);
  });
});
