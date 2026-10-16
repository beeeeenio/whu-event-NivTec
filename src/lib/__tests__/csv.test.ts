import { describe, expect, it } from 'vitest';
import type { MaterialListItem } from '../../domain/types';
import { materialListRows, materialListToCsv } from '../csv';

const items: MaterialListItem[] = [
  { pos: 1, gruppe: 'PLATTEN', artikel: 'Systempodest 2×1 m', artikelNr: '111 01 0', menge: 2, einheit: 'Stk.' },
  { pos: 2, gruppe: 'FÜSSE', artikel: 'LV-Fuß', menge: 8, einheit: 'Stk.' },
  { pos: 3, gruppe: 'PLATTEN', artikel: 'Systempodest, Viertelkreis R 1 m', menge: 1, einheit: 'Stk.' },
];

describe('materialListRows', () => {
  it('liefert die Kopfzeile und die Zeilen in Gruppenreihenfolge', () => {
    const rows = materialListRows(items);
    expect(rows[0]).toEqual(['Pos', 'Gruppe', 'Artikel', 'Art.-Nr.', 'Menge', 'Einheit']);
    expect(rows.slice(1).map((r) => r[2])).toEqual([
      'Systempodest 2×1 m',
      'Systempodest, Viertelkreis R 1 m',
      'LV-Fuß',
    ]);
    expect(rows.slice(1).map((r) => r[0])).toEqual(['1', '2', '3']);
  });

  it("ersetzt fehlende Artikelnummern standardmäßig durch '–'", () => {
    const rows = materialListRows(items);
    expect(rows[1][3]).toBe('111 01 0');
    expect(rows[2][3]).toBe('–');
    expect(rows[3][3]).toBe('–');
  });

  it("nimmt bei missingNr '' eine leere Zelle", () => {
    const rows = materialListRows(items, '');
    expect(rows[2][3]).toBe('');
    expect(rows[3][3]).toBe('');
  });

  it('macht alle Zellen zu Strings', () => {
    const rows = materialListRows(items);
    expect(rows.flat().every((c) => typeof c === 'string')).toBe(true);
    expect(rows[1][4]).toBe('2');
  });
});

describe('materialListToCsv', () => {
  it('erzeugt für ein festes Beispiel die erwartete CSV (Semikolon, Quoting, leere Art.-Nr.)', () => {
    const expected = [
      'Pos;Gruppe;Artikel;Art.-Nr.;Menge;Einheit',
      '1;PLATTEN;Systempodest 2×1 m;111 01 0;2;Stk.',
      '2;PLATTEN;Systempodest, Viertelkreis R 1 m;;1;Stk.',
      '3;FÜSSE;LV-Fuß;;8;Stk.',
    ].join('\n');
    expect(materialListToCsv(items)).toBe(expected);
  });

  it('quotet Zellen mit Semikolon und Anführungszeichen', () => {
    const csv = materialListToCsv([
      { pos: 1, gruppe: 'PLATTEN', artikel: 'Podest "Spezial"; 1 m', menge: 1, einheit: 'Stk.' },
    ]);
    expect(csv.split('\n')[1]).toBe('1;PLATTEN;"Podest ""Spezial""; 1 m";;1;Stk.');
  });
});
