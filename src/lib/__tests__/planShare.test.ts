import { describe, expect, it } from 'vitest';
import { buildShareUrl, decodePlanToken, encodePlanToken, readShareToken, SHARE_HASH_KEY } from '../planShare';
import type { Piece2D } from '../../domain/customShape';

/** 8×4 m Fläche mit 16 Stücken à 2×1 m, lückenlos gerastert. */
function grid8x4(): Piece2D[] {
  const out: Piece2D[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out.push({ id: `p${row}-${col}`, x: col * 2, y: row, w: 2, d: 1 });
    }
  }
  return out;
}

const kastenbuehneData = {
  schemaVersion: 1,
  kind: 'kastenbuehne',
  heightCm: 80,
  pieces: grid8x4(),
  forexPanels: [{ id: 'f1', pieceId: 'p0-0', side: 'front' }],
};

const tresenData = {
  schemaVersion: 1,
  kind: 'tresen',
  basePieces: grid8x4().slice(0, 4),
  topPieces: grid8x4().slice(4, 8),
};

describe('encodePlanToken / decodePlanToken', () => {
  it.each([
    ['kastenbuehne', kastenbuehneData],
    ['tresen', tresenData],
  ] as const)('Roundtrip für %s mit Codec z', async (kind, data) => {
    const token = await encodePlanToken(kind, data, 'z');
    const decoded = await decodePlanToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.kind).toBe(kind);
    expect(decoded!.data).toEqual(data);
  });

  it.each([
    ['kastenbuehne', kastenbuehneData],
    ['tresen', tresenData],
  ] as const)('Roundtrip für %s mit Codec j', async (kind, data) => {
    const token = await encodePlanToken(kind, data, 'j');
    const decoded = await decodePlanToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.kind).toBe(kind);
    expect(decoded!.data).toEqual(data);
  });

  it('Token trägt Plan-Typ und Codec im Präfix', async () => {
    expect((await encodePlanToken('tresen', tresenData, 'j')).startsWith('tresen.j.')).toBe(true);
    expect((await encodePlanToken('kastenbuehne', kastenbuehneData, 'z')).startsWith('kastenbuehne.z.')).toBe(true);
  });

  it('der komprimierte Token ist für einen 8×4-Plan kürzer als der JSON-Token', async () => {
    const z = await encodePlanToken('kastenbuehne', kastenbuehneData, 'z');
    const j = await encodePlanToken('kastenbuehne', kastenbuehneData, 'j');
    expect(z.length).toBeLessThan(j.length);
  });

  it('falscher Plan-Typ → null', async () => {
    const token = await encodePlanToken('kastenbuehne', kastenbuehneData, 'j');
    const wrongKind = token.replace(/^kastenbuehne\./, 'stadthalle.');
    expect(await decodePlanToken(wrongKind)).toBeNull();
  });

  it('falscher Codec-Buchstabe → null', async () => {
    const z = await encodePlanToken('kastenbuehne', kastenbuehneData, 'z');
    const j = await encodePlanToken('kastenbuehne', kastenbuehneData, 'j');
    expect(await decodePlanToken(z.replace('.z.', '.j.'))).toBeNull();
    expect(await decodePlanToken(j.replace('.j.', '.z.'))).toBeNull();
    expect(await decodePlanToken(z.replace('.z.', '.x.'))).toBeNull();
  });

  it('kaputtes base64 → null', async () => {
    const j = await encodePlanToken('tresen', tresenData, 'j');
    expect(await decodePlanToken(`tresen.j.${j.split('.')[2]}!!!`)).toBeNull();
    expect(await decodePlanToken('tresen.j.a')).toBeNull();
    const z = await encodePlanToken('tresen', tresenData, 'z');
    expect(await decodePlanToken(`tresen.z.${z.split('.')[2].slice(0, 10)}`)).toBeNull();
  });

  it('falsches Format und leere Eingabe → null', async () => {
    expect(await decodePlanToken('')).toBeNull();
    expect(await decodePlanToken('tresen')).toBeNull();
    expect(await decodePlanToken('tresen.j')).toBeNull();
    expect(await decodePlanToken('tresen.j.abc.def')).toBeNull();
    expect(await decodePlanToken('tresen.j.')).toBeNull();
  });

  it('kaputtes JSON → null', async () => {
    const payload = btoa('{nicht json').replace(/=+$/, '');
    expect(await decodePlanToken(`tresen.j.${payload}`)).toBeNull();
  });
});

describe('readShareToken', () => {
  it('liest das Token aus #plan=abc', () => {
    expect(readShareToken('#plan=abc')).toBe('abc');
  });

  it('findet das Token auch zwischen weiteren &-Teilen', () => {
    expect(readShareToken('#x=1&plan=abc')).toBe('abc');
    expect(readShareToken('#plan=abc&x=1')).toBe('abc');
  });

  it('ohne Token (leerer Hash oder anderer Schlüssel) → null', () => {
    expect(readShareToken('')).toBeNull();
    expect(readShareToken('#')).toBeNull();
    expect(readShareToken('#x=1')).toBeNull();
    expect(readShareToken('#plan=')).toBeNull();
    expect(readShareToken('#planx=abc')).toBeNull();
  });

  it('Schlüssel ist plan', () => {
    expect(SHARE_HASH_KEY).toBe('plan');
  });
});

describe('buildShareUrl', () => {
  it('hängt den Hash an eine Adresse ohne Hash an', () => {
    expect(buildShareUrl('https://example.org/planung', 'tresen.j.abc')).toBe('https://example.org/planung#plan=tresen.j.abc');
  });

  it('ersetzt einen vorhandenen Hash', () => {
    expect(buildShareUrl('https://example.org/planung?x=1#plan=alt', 'tresen.j.neu')).toBe(
      'https://example.org/planung?x=1#plan=tresen.j.neu',
    );
  });
});
