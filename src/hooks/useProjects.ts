import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addImportedProject,
  addItem,
  addProject,
  getActiveItem,
  getActiveProject,
  removeItem,
  removeProject,
  renameItem,
  renameProject,
  setActiveItem,
  setActiveProject,
  type Project,
  type ProjectItem,
  type ProjectStore,
} from '../domain/project';
import type { PlanKind } from '../domain/migrations';
import { saveForexPrints } from '../lib/forexPrintStore';
import { copyItemData, deleteItemData, loadProjectStore, saveProjectStore, writeItemDraft } from '../lib/projectStore';
import type { ProjectFile } from '../domain/projectFile';
import { flushDrafts } from './useDraftAutosave';

/** Projekte mit Tischen: wird bei jeder Änderung im Browser gespeichert. */
export function useProjects() {
  const [store, setStoreState] = useState<ProjectStore>(loadProjectStore);
  const storeRef = useRef(store);
  const [saveFailed, setSaveFailed] = useState(false);

  const commit = useCallback((next: ProjectStore) => {
    storeRef.current = next;
    setStoreState(next);
    setSaveFailed(!saveProjectStore(next));
  }, []);

  // Erster Start: das Standardprojekt gleich festschreiben.
  useEffect(() => {
    setSaveFailed(!saveProjectStore(storeRef.current));
  }, []);

  const project: Project = getActiveProject(store);
  const activeItem: ProjectItem | null = getActiveItem(project);

  const actions = {
    selectProject: (id: string) => commit(setActiveProject(storeRef.current, id)),
    createProject: (name: string) => commit(addProject(storeRef.current, name)),
    renameProject: (id: string, name: string) => commit(renameProject(storeRef.current, id, name)),
    deleteProject: (id: string) => {
      const { store: next, removedItems } = removeProject(storeRef.current, id);
      removedItems.forEach(deleteItemData);
      commit(next);
    },
    selectItem: (id: string) => commit(setActiveItem(storeRef.current, getActiveProject(storeRef.current).id, id)),
    createItem: (kind: PlanKind) => {
      commit(addItem(storeRef.current, getActiveProject(storeRef.current).id, kind).store);
    },
    renameItem: (id: string, name: string) =>
      commit(renameItem(storeRef.current, getActiveProject(storeRef.current).id, id, name)),
    deleteItem: (id: string) => {
      const { store: next, removed } = removeItem(storeRef.current, getActiveProject(storeRef.current).id, id);
      if (removed) deleteItemData(removed);
      commit(next);
    },
    duplicateItem: (id: string) => {
      const current = getActiveProject(storeRef.current);
      const source = current.items.find((i) => i.id === id);
      if (!source) return;
      flushDrafts();
      const { store: next, item } = addItem(storeRef.current, current.id, source.kind, `${source.name} (Kopie)`);
      void copyItemData(source, item);
      commit(next);
    },
    importProject: async (name: string, tische: ProjectFile['tische']) => {
      const { store: next, items } = addImportedProject(
        storeRef.current,
        name,
        tische.map((t) => ({ name: t.name, kind: t.kind })),
      );
      items.forEach((item, i) => {
        if (tische[i].plan !== null) writeItemDraft(item, tische[i].plan);
      });
      // Bilder vor dem Öffnen des Tisches speichern — er lädt sie beim Einhängen.
      await Promise.all(items.map((item, i) => (tische[i].forexPrints ? saveForexPrints(item.namespace, tische[i].forexPrints!) : null)));
      commit(next);
    },
    /** Für geteilte Links: aktiv wird der erste Tisch dieser Art, sonst entsteht einer. */
    openKind: (kind: PlanKind) => {
      const current = getActiveProject(storeRef.current);
      const existing = current.items.find((i) => i.kind === kind);
      commit(
        existing
          ? setActiveItem(storeRef.current, current.id, existing.id)
          : addItem(storeRef.current, current.id, kind).store,
      );
    },
  };

  return { store, project, activeItem, saveFailed, actions };
}
