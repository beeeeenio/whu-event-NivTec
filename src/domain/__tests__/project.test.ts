import { describe, expect, it } from 'vitest';
import {
  addItem,
  addProject,
  createDefaultStore,
  getActiveItem,
  getActiveProject,
  nextItemName,
  parseStore,
  removeItem,
  removeProject,
  renameItem,
  renameProject,
  setActiveItem,
  setActiveProject,
} from '../project';

describe('Standardprojekt', () => {
  it('behält die alten Namensräume, damit bestehende Pläne nicht verloren gehen', () => {
    const store = createDefaultStore();
    const project = getActiveProject(store);
    expect(project.items.map((i) => [i.kind, i.namespace])).toEqual([
      ['kastenbuehne', 'kastenbuehne'],
      ['tresen', 'tresen'],
    ]);
    expect(getActiveItem(project)?.kind).toBe('kastenbuehne');
  });
});

describe('Tische', () => {
  it('addItem legt einen Tisch mit eigenem Namensraum an und macht ihn aktiv', () => {
    const store = createDefaultStore();
    const pid = store.activeProjectId;
    const { store: next, item } = addItem(store, pid, 'tresen');
    expect(item.name).toBe('Tresen 2');
    expect(item.namespace).toBe(`item-${item.id}`);
    expect(getActiveProject(next).activeItemId).toBe(item.id);
    expect(getActiveProject(next).items).toHaveLength(3);
  });

  it('nextItemName vergibt keinen Namen doppelt', () => {
    const items = [
      { id: 'a', name: 'Tresen 2', kind: 'tresen' as const, namespace: 'x' },
    ];
    expect(nextItemName(items, 'tresen')).toBe('Tresen 3');
  });

  it('renameItem trimmt und ignoriert leere Namen', () => {
    const store = createDefaultStore();
    const project = getActiveProject(store);
    const id = project.items[0].id;
    const renamed = renameItem(store, project.id, id, '  Hauptbühne ');
    expect(getActiveProject(renamed).items[0].name).toBe('Hauptbühne');
    const unchanged = renameItem(renamed, project.id, id, '   ');
    expect(getActiveProject(unchanged).items[0].name).toBe('Hauptbühne');
  });

  it('removeItem wählt einen anderen Tisch aus, wenn der aktive wegfällt', () => {
    const store = createDefaultStore();
    const project = getActiveProject(store);
    const { store: next, removed } = removeItem(store, project.id, project.items[0].id);
    expect(removed?.namespace).toBe('kastenbuehne');
    expect(getActiveProject(next).activeItemId).toBe(project.items[1].id);
  });

  it('setActiveItem ignoriert unbekannte Tische', () => {
    const store = createDefaultStore();
    const project = getActiveProject(store);
    expect(getActiveProject(setActiveItem(store, project.id, 'gibt-es-nicht')).activeItemId).toBe(project.activeItemId);
  });
});

describe('Projekte', () => {
  it('addProject legt ein Projekt mit einem leeren Tisch an und wählt es aus', () => {
    const store = addProject(createDefaultStore(), 'Sommerfest');
    expect(store.projects).toHaveLength(2);
    const project = getActiveProject(store);
    expect(project.name).toBe('Sommerfest');
    expect(project.items).toHaveLength(1);
    expect(project.items[0].namespace).toMatch(/^item-/);
  });

  it('removeProject liefert die entfernten Tische zum Aufräumen und wechselt das aktive Projekt', () => {
    const store = addProject(createDefaultStore(), 'Zweites');
    const second = getActiveProject(store);
    const { store: next, removedItems } = removeProject(store, second.id);
    expect(removedItems).toHaveLength(1);
    expect(next.projects).toHaveLength(1);
    expect(next.activeProjectId).toBe(next.projects[0].id);
  });

  it('das letzte Projekt wird durch ein leeres Standardprojekt ersetzt', () => {
    const store = createDefaultStore();
    const { store: next, removedItems } = removeProject(store, store.activeProjectId);
    expect(removedItems).toHaveLength(2);
    expect(next.projects).toHaveLength(1);
  });

  it('renameProject und setActiveProject', () => {
    const store = addProject(createDefaultStore(), 'B');
    const first = store.projects[0];
    expect(renameProject(store, first.id, 'Neu').projects[0].name).toBe('Neu');
    expect(setActiveProject(store, first.id).activeProjectId).toBe(first.id);
  });
});

describe('parseStore', () => {
  it('nimmt ein gültiges Objekt an (Rundreise über JSON)', () => {
    const store = createDefaultStore();
    expect(parseStore(JSON.parse(JSON.stringify(store)))).toEqual(store);
  });

  it('verwirft Unbrauchbares', () => {
    expect(parseStore(null)).toBeNull();
    expect(parseStore({ version: 2, projects: [] })).toBeNull();
    expect(parseStore({ version: 1, projects: [{ id: 'a', name: 'x', items: [{ id: 'i', name: 'n', kind: 'tisch', namespace: 'q' }] }] })).toBeNull();
  });

  it('korrigiert eine ungültige aktive ID auf ein vorhandenes Element', () => {
    const store = createDefaultStore();
    const broken = { ...store, activeProjectId: 'weg', projects: store.projects.map((p) => ({ ...p, activeItemId: 'weg' })) };
    const parsed = parseStore(broken)!;
    expect(parsed.activeProjectId).toBe(store.projects[0].id);
    expect(parsed.projects[0].activeItemId).toBe(store.projects[0].items[0].id);
  });
});
