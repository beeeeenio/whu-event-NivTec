import { describe, expect, it } from 'vitest';
import type { ProjectItem } from '../project';
import { planMaterialList, projectMaterial } from '../projectMaterial';

const piece = (id: string, x: number, y: number, w = 2, d = 1) => ({ id, x, y, w, d });
const bühne = { heightCm: 40, pieces: [piece('a', 0, 0), piece('b', 2, 0)] };
const tresen = {
  baseHeightCm: 40,
  spindelHeightCm: 20,
  basePieces: [piece('a', 0, 0), piece('b', 2, 0)],
  topPieces: [piece('c', 0, 0, 2, 0.5)],
};
const item = (id: string, kind: ProjectItem['kind']): ProjectItem => ({ id, name: id, kind, namespace: id });
const qty = (list: { artikel: string; menge: number }[], text: string) =>
  list.filter((i) => i.artikel.includes(text)).reduce((s, i) => s + i.menge, 0);

describe('planMaterialList', () => {
  it('Bühne: zählt Platten und Füße', () => {
    const list = planMaterialList('kastenbuehne', bühne)!;
    expect(qty(list, 'Systempodest 2×1')).toBe(2);
    expect(qty(list, 'LV-Fuß')).toBeGreaterThan(0);
  });

  it('Tresen: Unterbau und Thekenplatte, Spindelfüße getrennt von LV-Füßen', () => {
    const list = planMaterialList('tresen', tresen)!;
    expect(qty(list, 'Systempodest 2×1')).toBe(2);
    expect(qty(list, 'Systempodest 2×0,5')).toBe(1);
    expect(qty(list, 'VS-Fuß')).toBeGreaterThan(0);
  });

  it('liefert null ohne gespeicherten oder bei unlesbarem Plan', () => {
    expect(planMaterialList('kastenbuehne', null)).toBeNull();
    expect(planMaterialList('tresen', { unsinn: true })).toBeNull();
  });
});

describe('projectMaterial', () => {
  it('führt gleiche Positionen mehrerer Tische zusammen', () => {
    const items = [item('t1', 'kastenbuehne'), item('t2', 'kastenbuehne'), item('t3', 'kastenbuehne')];
    const drafts: Record<string, unknown> = { t1: bühne, t2: bühne, t3: null };
    const { perItem, total } = projectMaterial(items, (i) => drafts[i.id]);
    expect(perItem.map((p) => p.list.length > 0)).toEqual([true, true, false]);
    expect(qty(total, 'Systempodest 2×1')).toBe(4);
    expect(total.map((i) => i.pos)).toEqual(total.map((_, n) => n + 1));
  });

  it('mischt Bühne und Tresen in einer Gesamtliste', () => {
    const items = [item('b', 'kastenbuehne'), item('t', 'tresen')];
    const drafts: Record<string, unknown> = { b: bühne, t: tresen };
    const { total } = projectMaterial(items, (i) => drafts[i.id]);
    expect(qty(total, 'Systempodest 2×1')).toBe(4);
    expect(qty(total, 'VS-Fuß')).toBeGreaterThan(0);
  });
});
