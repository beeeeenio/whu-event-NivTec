import { describe, expect, it } from 'vitest';
import {
  CLIPBOARD_TYPE,
  getMemoryClipboard,
  makeClipboardPayload,
  parseClipboard,
  placeClipboard,
  serializeClipboard,
  setMemoryClipboard,
  type PiecesClipboardPayload,
} from '../clipboard';
import type { Piece2D } from '../customShape';

describe('clipboard', () => {
  const pieces: Piece2D[] = [
    { id: 'a', x: 2, y: 1, w: 2, d: 1 },
    { id: 'b', x: 4, y: 1, w: 1, d: 1 },
    { id: 'c', x: 0, y: 3, w: 1, d: 2, corner: 'tl' },
  ];

  describe('makeClipboardPayload', () => {
    it('normalisiert auf (0,0) und entfernt die IDs', () => {
      const p = makeClipboardPayload(pieces, ['a', 'b']);
      expect(p).not.toBeNull();
      expect(p!.type).toBe(CLIPBOARD_TYPE);
      expect(p!.version).toBe(1);
      expect(p!.pieces).toEqual([
        { x: 0, y: 0, w: 2, d: 1 },
        { x: 2, y: 0, w: 1, d: 1 },
      ]);
      for (const piece of p!.pieces) expect(piece).not.toHaveProperty('id');
    });

    it('übernimmt Ecke und Form nur, wenn gesetzt', () => {
      const p = makeClipboardPayload(pieces, ['c']);
      expect(p!.pieces[0]).toEqual({ x: 0, y: 0, w: 1, d: 2, corner: 'tl' });
      expect(p!.pieces[0]).not.toHaveProperty('shape');
    });

    it('liefert null bei leerer Auswahl', () => {
      expect(makeClipboardPayload(pieces, [])).toBeNull();
      expect(makeClipboardPayload(pieces, ['unbekannt'])).toBeNull();
    });
  });

  describe('serialize / parse', () => {
    it('Roundtrip erhält die Stücke', () => {
      const p = makeClipboardPayload(pieces, ['a', 'b', 'c'])!;
      expect(parseClipboard(serializeClipboard(p))).toEqual(p);
    });

    it('liefert null bei ungültigem JSON', () => {
      expect(parseClipboard('kein json {')).toBeNull();
      expect(parseClipboard('')).toBeNull();
    });

    it('liefert null bei falschem type oder version', () => {
      const good = { type: CLIPBOARD_TYPE, version: 1, pieces: [{ x: 0, y: 0, w: 1, d: 1 }] };
      expect(parseClipboard(JSON.stringify({ ...good, type: 'andere/app' }))).toBeNull();
      expect(parseClipboard(JSON.stringify({ ...good, version: 2 }))).toBeNull();
      expect(parseClipboard(JSON.stringify({ pieces: good.pieces }))).toBeNull();
    });

    it('liefert null bei ungültigem Stück', () => {
      const bad = (piece: unknown) => JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, pieces: [piece] });
      expect(parseClipboard(bad({ x: 0, y: 0, w: 0, d: 1 }))).toBeNull();
      expect(parseClipboard(bad({ x: 0, y: 0, w: -1, d: 1 }))).toBeNull();
      expect(parseClipboard(bad({ x: 0, y: 0, w: 1 }))).toBeNull();
    });

    it('liefert null bei leerer Stückliste', () => {
      expect(parseClipboard(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, pieces: [] }))).toBeNull();
    });

    it('entfernt eine mitgelieferte id', () => {
      const text = JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, pieces: [{ id: 'x', x: 0, y: 0, w: 1, d: 1 }] });
      const p = parseClipboard(text);
      expect(p!.pieces[0]).not.toHaveProperty('id');
    });
  });

  describe('placeClipboard', () => {
    const payload: PiecesClipboardPayload = {
      type: CLIPBOARD_TYPE,
      version: 1,
      pieces: [
        { x: 0, y: 0, w: 2, d: 1 },
        { x: 2, y: 0, w: 1, d: 1 },
      ],
    };

    it('setzt die Kopie am Anker ohne Kollision (auf das Raster gerastet)', () => {
      const placed = placeClipboard([], payload, { x: 1.3, y: 2.1 });
      expect(placed).toEqual([
        { x: 1.5, y: 2, w: 2, d: 1 },
        { x: 3.5, y: 2, w: 1, d: 1 },
      ]);
    });

    it('weicht bei Belegung am Anker nach rechts aus', () => {
      const existing: Piece2D[] = [{ id: 'e', x: 0, y: 0, w: 2, d: 2 }];
      const placed = placeClipboard(existing, payload, { x: 0, y: 0 });
      expect(placed).not.toBeNull();
      // Am Anker (x=0 bis 2 m) und bis 1,5 m Versatz kollidiert der Bestand; die erste freie Stelle ist x=2 m.
      expect(placed![0]).toEqual({ x: 2, y: 0, w: 2, d: 1 });
      expect(placed![1]).toEqual({ x: 4, y: 0, w: 1, d: 1 });
    });

    it('setzt ohne Anker rechts neben den Bestand auf y=0', () => {
      const existing: Piece2D[] = [
        { id: 'e1', x: 0, y: 0, w: 2, d: 1 },
        { id: 'e2', x: 1, y: 3, w: 3.2, d: 1 },
      ];
      const placed = placeClipboard(existing, payload, null);
      // maxX = 4.2, aufgerundet aufs Raster = 4.5
      expect(placed![0]).toEqual({ x: 4.5, y: 0, w: 2, d: 1 });
      expect(placed![1]).toEqual({ x: 6.5, y: 0, w: 1, d: 1 });
    });

    it('liefert null, wenn kein Platz gefunden wird', () => {
      const existing: Piece2D[] = [{ id: 'e', x: 0, y: 0, w: 100, d: 5 }];
      expect(placeClipboard(existing, payload, { x: 0, y: 0 })).toBeNull();
    });

    it('liefert null bei leerer Payload', () => {
      expect(placeClipboard([], { ...payload, pieces: [] }, null)).toBeNull();
    });
  });

  describe('Zwischenablage im Speicher', () => {
    it('merkt sich die zuletzt gesetzte Payload', () => {
      const p = makeClipboardPayload([{ id: 'a', x: 0, y: 0, w: 1, d: 1 }], ['a'])!;
      setMemoryClipboard(p);
      expect(getMemoryClipboard()).toEqual(p);
      setMemoryClipboard(null);
      expect(getMemoryClipboard()).toBeNull();
    });
  });
});
