import { describe, expect, it } from 'vitest';
import { mirrorPayload, payloadMatches, payloadSize, payloadToFilled, rotatePayload, type ToolPayload } from '../toolPayload';

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
