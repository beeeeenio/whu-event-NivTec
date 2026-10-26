import { describe, expect, it } from 'vitest';
import { addImportedProject, createDefaultStore, getActiveProject } from '../project';
import { buildProjectFile, parseProjectFile } from '../projectFile';

const piece = (id: string, x: number, y: number) => ({ id, x, y, w: 2, d: 1 });
const bühne = { schemaVersion: 1, kind: 'kastenbuehne', heightCm: 40, pieces: [piece('a', 0, 0)] };
const tresen = { schemaVersion: 1, kind: 'tresen', baseHeightCm: 40, spindelHeightCm: 20, basePieces: [piece('a', 0, 0)], topPieces: [] };

describe('Projektdatei', () => {
  it('Rundreise: Export und Import behalten Tische, Arten und Pläne', () => {
    const project = getActiveProject(createDefaultStore());
    const drafts: Record<string, unknown> = { [project.items[0].namespace]: bühne, [project.items[1].namespace]: tresen };
    const file = buildProjectFile(project, (i) => drafts[i.namespace]);
    const parsed = parseProjectFile(JSON.parse(JSON.stringify(file)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.name).toBe('Mein Projekt');
    expect(parsed.tische.map((t) => [t.name, t.kind])).toEqual([
      ['Bühne', 'kastenbuehne'],
      ['Tresen', 'tresen'],
    ]);
    expect(parsed.tische[0].plan).toEqual(bühne);
    expect(parsed.notes).toEqual([]);
  });

  it('leere Tische bleiben ohne Plan erhalten', () => {
    const project = getActiveProject(createDefaultStore());
    const file = buildProjectFile(project, () => null);
    const parsed = parseProjectFile(file);
    expect(parsed.ok && parsed.tische.every((t) => t.plan === null)).toBe(true);
  });

  it('lehnt fremde Dateien verständlich ab', () => {
    expect(parseProjectFile(null)).toMatchObject({ ok: false });
    expect(parseProjectFile(bühne)).toMatchObject({ ok: false, error: expect.stringContaining('keine Projektdatei') });
    expect(parseProjectFile({ format: 'nivtec-projekt', version: 2, tische: [] })).toMatchObject({ ok: false });
    expect(parseProjectFile({ format: 'nivtec-projekt', version: 1, tische: [] })).toMatchObject({ ok: false });
  });

  it('verwirft einen kaputten Plan, behält aber den Tisch und meldet es', () => {
    const parsed = parseProjectFile({
      format: 'nivtec-projekt',
      version: 1,
      name: 'X',
      tische: [
        { name: 'Gut', kind: 'kastenbuehne', plan: bühne },
        { name: 'Kaputt', kind: 'tresen', plan: { unsinn: 1 } },
        { name: 'Falsche Art', kind: 'tisch', plan: null },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tische.map((t) => t.name)).toEqual(['Gut', 'Kaputt']);
    expect(parsed.tische[1].plan).toBeNull();
    expect(parsed.notes).toHaveLength(2);
  });
});

describe('addImportedProject', () => {
  it('legt ein neues aktives Projekt mit frischen Speicherorten an', () => {
    const store = createDefaultStore();
    const { store: next, items } = addImportedProject(store, 'Import', [
      { name: 'A', kind: 'kastenbuehne' },
      { name: 'B', kind: 'tresen' },
    ]);
    expect(next.projects).toHaveLength(2);
    expect(getActiveProject(next).name).toBe('Import');
    expect(items.map((i) => i.namespace)).toEqual(items.map((i) => `item-${i.id}`));
    expect(getActiveProject(next).activeItemId).toBe(items[0].id);
  });
});
