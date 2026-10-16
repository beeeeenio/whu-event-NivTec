import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteBlock, listBlocks, saveBlock, selectionToBlock, subscribeBlocks, type SavedBlock } from '../blocks';
import type { Piece2D } from '../../domain/customShape';

/** Einfacher localStorage-Ersatz für die Tests (die Testumgebung ist 'node'). */
function stubLocalStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set('nivtec:blocks', initial);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selectionToBlock', () => {
  const pieces: Piece2D[] = [
    { id: 'a', x: 2, y: 3, w: 2, d: 1 },
    { id: 'b', x: 4, y: 3, w: 1, d: 1, corner: 'tl' },
    { id: 'c', x: 9, y: 9, w: 1, d: 1 },
  ];

  it('normalisiert die Auswahl auf (0,0) relativ zur linken oberen Ecke', () => {
    const b = selectionToBlock(pieces, ['a', 'b'], 'Paar', 'blk-1');
    expect(b).toEqual({
      id: 'blk-1',
      name: 'Paar',
      pieces: [
        { x: 0, y: 0, w: 2, d: 1 },
        { x: 2, y: 0, w: 1, d: 1, corner: 'tl' },
      ],
    });
  });

  it('entfernt die IDs der Stücke', () => {
    const b = selectionToBlock(pieces, ['a'], 'Einzel', 'blk-2');
    expect(b?.pieces[0]).not.toHaveProperty('id');
  });

  it('ignoriert IDs, die nicht auf dem Plan liegen', () => {
    const b = selectionToBlock(pieces, ['c', 'gibt-es-nicht'], 'C', 'blk-3');
    expect(b?.pieces).toEqual([{ x: 0, y: 0, w: 1, d: 1 }]);
  });

  it('liefert bei leerer Auswahl null', () => {
    expect(selectionToBlock(pieces, [], 'Leer', 'blk-4')).toBeNull();
    expect(selectionToBlock(pieces, ['gibt-es-nicht'], 'Leer', 'blk-5')).toBeNull();
  });
});

describe('listBlocks', () => {
  it('liefert ohne localStorage eine leere Liste', () => {
    expect(typeof localStorage).toBe('undefined');
    expect(listBlocks()).toEqual([]);
  });

  it('speichert und liest Bausteine über localStorage (überlebt ein Neuladen)', () => {
    const store = stubLocalStorage();
    const block: SavedBlock = { id: 'blk-1', name: 'Paar', pieces: [{ x: 0, y: 0, w: 2, d: 1 }] };
    expect(saveBlock(block)).toEqual([block]);
    expect(store.get('nivtec:blocks')).toBeDefined();
    expect(listBlocks()).toEqual([block]);
  });

  it('ersetzt einen Baustein mit gleicher id und löscht per deleteBlock', () => {
    stubLocalStorage();
    saveBlock({ id: 'x', name: 'Alt', pieces: [{ x: 0, y: 0, w: 1, d: 1 }] });
    const next = saveBlock({ id: 'x', name: 'Neu', pieces: [{ x: 0, y: 0, w: 1, d: 1 }] });
    expect(next.map((b) => b.name)).toEqual(['Neu']);
    expect(deleteBlock('x')).toEqual([]);
    expect(listBlocks()).toEqual([]);
  });

  it('verwirft beschädigte Einträge und behält gültige', () => {
    stubLocalStorage(
      JSON.stringify([
        { id: 'gut', name: 'Gut', pieces: [{ x: 0, y: 0, w: 2, d: 1 }] },
        { id: 'kaputt-breite', name: 'Kaputt', pieces: [{ x: 0, y: 0, w: -1, d: 1 }] },
        { id: 'kaputt-ecke', name: 'Ecke', pieces: [{ x: 0, y: 0, w: 3, d: 3, corner: 'tl' }] },
        { id: 'leer', name: 'Leer', pieces: [] },
        { name: 'ohne id', pieces: [{ x: 0, y: 0, w: 1, d: 1 }] },
      ]),
    );
    expect(listBlocks().map((b) => b.id)).toEqual(['gut']);
  });

  it('liefert bei unlesbaren Daten eine leere Liste', () => {
    stubLocalStorage('{kein json');
    expect(listBlocks()).toEqual([]);
  });
});

describe('subscribeBlocks', () => {
  it('meldet Speichern und Löschen an alle Abonnenten (z. B. beide Tresen-Ebenen) und lässt sich abmelden', () => {
    stubLocalStorage();
    vi.stubGlobal('window', new EventTarget());
    const onChange = vi.fn();
    const unsubscribe = subscribeBlocks(onChange);
    saveBlock({ id: 'x', name: 'X', pieces: [{ x: 0, y: 0, w: 1, d: 1 }] });
    deleteBlock('x');
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    saveBlock({ id: 'y', name: 'Y', pieces: [{ x: 0, y: 0, w: 1, d: 1 }] });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ohne window: kein Fehler', () => {
    expect(() => subscribeBlocks(() => {})()).not.toThrow();
  });
});
