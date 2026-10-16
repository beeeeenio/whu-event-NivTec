import { describe, it, expect } from 'vitest';
import { setDocField, type KastenbuehneDoc } from '../planDocument';
import type { Piece2D } from '../customShape';
import { applyChange, createHistory, undoHistory } from '../../lib/history';

const piece = (id: string, x: number): Piece2D => ({ id, x, y: 0, w: 1, d: 1 });

function makeDoc(): KastenbuehneDoc {
  return { heightCm: 60, pieces: [piece('a', 0)], forexPanels: [] };
}

describe('setDocField', () => {
  it('setzt einen Wert direkt', () => {
    const doc = makeDoc();
    const next = setDocField(doc, 'heightCm', 80);
    expect(next.heightCm).toBe(80);
    expect(doc.heightCm).toBe(60);
  });

  it('wendet einen Updater auf den bisherigen Wert an', () => {
    const doc = makeDoc();
    const next = setDocField(doc, 'pieces', (prev) => [...prev, piece('b', 1)]);
    expect(next.pieces.map((p) => p.id)).toEqual(['a', 'b']);
    expect(doc.pieces).toHaveLength(1);
  });

  it('liefert dieselbe Referenz, wenn der Updater den alten Wert zurückgibt', () => {
    const doc = makeDoc();
    expect(setDocField(doc, 'pieces', (prev) => prev)).toBe(doc);
  });

  it('liefert dieselbe Referenz, wenn ein Wert gleich bleibt', () => {
    const doc = makeDoc();
    expect(setDocField(doc, 'heightCm', 60)).toBe(doc);
  });

  it('liefert eine neue Dokument-Referenz bei Änderung, andere Felder bleiben referenzgleich', () => {
    const doc = makeDoc();
    const next = setDocField(doc, 'heightCm', 80);
    expect(next).not.toBe(doc);
    expect(next.pieces).toBe(doc.pieces);
    expect(next.forexPanels).toBe(doc.forexPanels);
  });
});

describe('setDocField mit applyChange', () => {
  it('ein No-op erzeugt keinen past-Eintrag', () => {
    const doc = makeDoc();
    const h = createHistory(doc);
    const next = setDocField(doc, 'heightCm', doc.heightCm);
    const h2 = applyChange(h, next, 1);
    expect(h2).toBe(h);
    expect(h2.past).toHaveLength(0);
  });

  it('eine Änderung erzeugt genau einen past-Eintrag, der sich rückgängig machen lässt', () => {
    const doc = makeDoc();
    const h = createHistory(doc);
    const h2 = applyChange(h, setDocField(doc, 'heightCm', 80), 1);
    expect(h2.past).toHaveLength(1);
    const h3 = undoHistory(h2);
    expect(h3.present.heightCm).toBe(60);
  });
});
