import { describe, expect, it } from 'vitest';
import type { Piece2D } from '../customShape';
import {
  addAllFrontEdges,
  appendMaterialItems,
  buildForexMaterialItems,
  freeEdges,
  placeForexPanels,
  toggleForexPanel,
} from '../forex';
import { parseKastenbuehneFile, sanitizeForexPanels, type KastenbuehneSavedState } from '../savedState';
import type { ForexPanel, MaterialListItem } from '../types';

function piece(id: string, x: number, y: number, w: number, d: number, extra: Partial<Piece2D> = {}): Piece2D {
  return { id, x, y, w, d, ...extra };
}

// Zwei 2×1-Podeste nebeneinander, dahinter ein drittes: 4×2 m mit einer inneren Stoßkante.
const row = [piece('piece-1', 0, 1, 2, 1), piece('piece-2', 2, 1, 2, 1), piece('piece-3', 0, 0, 2, 1)];

describe('freeEdges', () => {
  it('lässt Kanten weg, an denen ein Nachbarpodest anliegt', () => {
    const keys = freeEdges(row).map((e) => `${e.pieceId}:${e.side}`).sort();
    expect(keys).toEqual(
      [
        'piece-1:bottom',
        'piece-1:left',
        'piece-2:bottom',
        'piece-2:right',
        'piece-2:top',
        'piece-3:left',
        'piece-3:right',
        'piece-3:top',
      ].sort(),
    );
  });

  it('kennt Katheten und Schräge eines Dreiecks; zwei Dreiecke teilen sich die Schräge', () => {
    const tri = piece('t1', 0, 0, 1, 1, { corner: 'tl' });
    expect(freeEdges([tri]).map((e) => e.side).sort()).toEqual(['hyp', 'left', 'top']);
    const other = piece('t2', 0, 0, 1, 1, { corner: 'br' });
    expect(freeEdges([tri, other]).some((e) => e.side === 'hyp')).toBe(false);
  });

  it('Viertelkreis hat keine Schräge', () => {
    const qc = piece('q', 0, 0, 1, 1, { corner: 'tl', shape: 'viertelkreis' });
    expect(freeEdges([qc]).map((e) => e.side).sort()).toEqual(['left', 'top']);
  });
});

describe('Forex-Schalter', () => {
  it('toggle schaltet an und wieder aus, IDs sind fx-N', () => {
    const on = toggleForexPanel([], 'piece-1', 'bottom');
    expect(on).toEqual([{ id: 'fx-1', pieceId: 'piece-1', side: 'bottom' }]);
    const two = toggleForexPanel(on, 'piece-2', 'bottom');
    expect(two[1].id).toBe('fx-2');
    expect(toggleForexPanel(two, 'piece-1', 'bottom')).toEqual([two[1]]);
  });

  it('„Alle Vorderkanten“ setzt nur freie bottom-Kanten und keine doppelt', () => {
    const existing: ForexPanel[] = [{ id: 'fx-7', pieceId: 'piece-1', side: 'bottom' }];
    const result = addAllFrontEdges(row, existing);
    expect(result.map((p) => `${p.id}:${p.pieceId}:${p.side}`)).toEqual([
      'fx-7:piece-1:bottom',
      'fx-8:piece-2:bottom',
    ]);
  });

  it('Blenden an nicht mehr freien Kanten fallen beim Platzieren weg', () => {
    const panels: ForexPanel[] = [
      { id: 'fx-1', pieceId: 'piece-3', side: 'bottom' }, // innen, an piece-1
      { id: 'fx-2', pieceId: 'piece-1', side: 'bottom' },
      { id: 'fx-3', pieceId: 'gelöscht', side: 'top' },
    ];
    expect(placeForexPanels(row, panels).map((p) => p.panel.id)).toEqual(['fx-2']);
  });
});

describe('sanitizeForexPanels', () => {
  const pieces = [piece('piece-1', 0, 0, 2, 1), piece('tri', 2, 0, 1, 1, { corner: 'tl' })];

  it('verwirft ungültige Einträge und behält gültige mit optionalen Feldern', () => {
    const raw = [
      { id: 'fx-1', pieceId: 'piece-1', side: 'bottom', thicknessMm: 5, printGroup: 'front' },
      { id: 'fx-2', pieceId: 'unbekannt', side: 'bottom' }, // pieceId existiert nicht
      { id: 'fx-3', pieceId: 'piece-1', side: 'vorne' }, // ungültige side
      { id: 'fx-4', pieceId: 'piece-1', side: 'hyp' }, // hyp bei Rechteck
      { id: 'fx-5', pieceId: 'tri', side: 'hyp', printGroup: 'front' },
      { id: 'fx-6', pieceId: 'tri', side: 'bottom' }, // Dreieck 'tl' hat keine Unterkante
      { id: 'fx-1', pieceId: 'piece-1', side: 'top' }, // doppelte id
      { pieceId: 'piece-1', side: 'left' }, // fehlende id
      { id: 'fx-7', pieceId: 'piece-1', side: 'bottom' }, // zweite Blende an derselben Kante
      { id: 'fx-8', pieceId: 'piece-1', side: 'left', thicknessMm: -3, printGroup: 42 },
      null,
      'fx-9',
    ];
    expect(sanitizeForexPanels(raw, pieces)).toEqual([
      { id: 'fx-1', pieceId: 'piece-1', side: 'bottom', thicknessMm: 5, printGroup: 'front' },
      { id: 'fx-5', pieceId: 'tri', side: 'hyp', printGroup: 'front' },
      { id: 'fx-8', pieceId: 'piece-1', side: 'left' },
    ]);
  });

  it('kein Array → leere Liste', () => {
    expect(sanitizeForexPanels({ foo: 1 }, pieces)).toEqual([]);
  });

  it('alte Dateien ohne forexPanels laden weiter (Feld bleibt undefined)', () => {
    const result = parseKastenbuehneFile({ heightCm: 60, pieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.forexPanels).toBeUndefined();
  });
});

describe('Export → Import', () => {
  it('Roundtrip über JSON erhält Stücke und Forex-Blenden unverändert', () => {
    const state: KastenbuehneSavedState = {
      heightCm: 60,
      pieces: [
        { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
        { id: 'piece-2', x: 2, y: 0, w: 1, d: 1, corner: 'tl' },
      ],
      forexPanels: [
        { id: 'fx-1', pieceId: 'piece-1', side: 'bottom', printGroup: 'logo' },
        { id: 'fx-2', pieceId: 'piece-2', side: 'hyp', thicknessMm: 5, printGroup: 'logo' },
        { id: 'fx-3', pieceId: 'piece-1', side: 'left' },
      ],
    };
    const result = parseKastenbuehneFile(JSON.parse(JSON.stringify(state)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(state);
  });

  it('Export enthält keine Druckbilder — nur die Felder des Austauschformats', () => {
    const raw = {
      pieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
      forexPanels: [{ id: 'fx-1', pieceId: 'piece-1', side: 'bottom', image: 'data:image/png;base64,AAAA' }],
    };
    const result = parseKastenbuehneFile(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.forexPanels).toEqual([{ id: 'fx-1', pieceId: 'piece-1', side: 'bottom' }]);
  });
});

describe('buildForexMaterialItems', () => {
  it('zählt Forex-Platten nach Maß (Länge × Höhe bis 1 cm unter Belag, Stärke)', () => {
    const pieces = [
      piece('a', 0, 0, 2, 1),
      piece('b', 2, 0, 2, 1),
      piece('c', 4, 0, 2, 1),
      piece('d', 6, 0, 1, 1),
    ];
    const panels = addAllFrontEdges(pieces, []);
    panels.push({ id: 'fx-99', pieceId: 'd', side: 'right', thicknessMm: 10 });
    const items = buildForexMaterialItems(pieces, panels, 60);
    expect(items.map((i) => [i.gruppe, i.artikel, i.menge, i.einheit])).toEqual([
      ['VERKLEIDUNG', 'Forex 2000 × 590 mm, 5 mm', 3, 'Stk.'],
      ['VERKLEIDUNG', 'Forex 1000 × 590 mm, 5 mm', 1, 'Stk.'],
      ['VERKLEIDUNG', 'Forex 1000 × 590 mm, 10 mm', 1, 'Stk.'],
    ]);
  });

  it('Schräge eines 1×1-Dreiecks wird mit ihrer echten Länge gezählt', () => {
    const tri = piece('t', 0, 0, 1, 1, { corner: 'tl' });
    const items = buildForexMaterialItems([tri], [{ id: 'fx-1', pieceId: 't', side: 'hyp' }], 40);
    expect(items[0].artikel).toBe('Forex 1414 × 390 mm, 5 mm');
  });

  it('wird an die Materialliste angehängt und fortlaufend nummeriert', () => {
    const base: MaterialListItem[] = [
      { pos: 1, gruppe: 'PLATTEN', artikel: 'x', menge: 1, einheit: 'Stk.' },
      { pos: 2, gruppe: 'FÜSSE', artikel: 'y', menge: 4, einheit: 'Stk.' },
    ];
    const extra = buildForexMaterialItems([piece('a', 0, 0, 2, 1)], [{ id: 'fx-1', pieceId: 'a', side: 'bottom' }], 60);
    const merged = appendMaterialItems(base, extra);
    expect(merged.map((i) => i.pos)).toEqual([1, 2, 3]);
    expect(merged[2].artikel).toBe('Forex 2000 × 590 mm, 5 mm');
  });
});
