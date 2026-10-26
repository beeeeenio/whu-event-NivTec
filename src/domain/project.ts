import type { PlanKind } from './migrations';

/** Ein Tisch im Projekt: eine eigenständige Bühne oder ein Tresen mit eigenem Plan. */
export interface ProjectItem {
  id: string;
  name: string;
  kind: PlanKind;
  /** Speicherort des Plans (Entwurf, benannte Stände, Forex-Drucke). Alte Pläne behalten ihren Namensraum. */
  namespace: string;
}

export interface Project {
  id: string;
  name: string;
  items: ProjectItem[];
  activeItemId: string | null;
}

export interface ProjectStore {
  version: 1;
  activeProjectId: string;
  projects: Project[];
}

/** Namensräume, unter denen die Pläne vor der Einführung von Projekten gespeichert wurden. */
export const LEGACY_NAMESPACE: Record<PlanKind, string> = { kastenbuehne: 'kastenbuehne', tresen: 'tresen' };

export const KIND_LABEL: Record<PlanKind, string> = { kastenbuehne: 'Bühne', tresen: 'Tresen' };

let idCounter = 0;
export function makeId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Nächster freier Standardname, z. B. "Tresen 2" — zählt nur Tische gleicher Art. */
export function nextItemName(items: ProjectItem[], kind: PlanKind): string {
  const label = kind === 'tresen' ? 'Tresen' : 'Bühne';
  const taken = new Set(items.map((i) => i.name));
  for (let n = items.filter((i) => i.kind === kind).length + 1; ; n++) {
    const candidate = `${label} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Standardprojekt für den ersten Start: die beiden bisherigen Pläne bleiben unter ihren alten Namensräumen erhalten. */
export function createDefaultStore(): ProjectStore {
  const items: ProjectItem[] = [
    { id: makeId(), name: 'Bühne', kind: 'kastenbuehne', namespace: LEGACY_NAMESPACE.kastenbuehne },
    { id: makeId(), name: 'Tresen', kind: 'tresen', namespace: LEGACY_NAMESPACE.tresen },
  ];
  const project: Project = { id: makeId(), name: 'Mein Projekt', items, activeItemId: items[0].id };
  return { version: 1, activeProjectId: project.id, projects: [project] };
}

export function getActiveProject(store: ProjectStore): Project {
  return store.projects.find((p) => p.id === store.activeProjectId) ?? store.projects[0];
}

export function getActiveItem(project: Project): ProjectItem | null {
  return project.items.find((i) => i.id === project.activeItemId) ?? project.items[0] ?? null;
}

function updateProject(store: ProjectStore, projectId: string, fn: (p: Project) => Project): ProjectStore {
  return { ...store, projects: store.projects.map((p) => (p.id === projectId ? fn(p) : p)) };
}

function cleanName(name: string, fallback: string): string {
  const trimmed = name.trim().slice(0, 80);
  return trimmed === '' ? fallback : trimmed;
}

export function addProject(store: ProjectStore, name: string): ProjectStore {
  const project: Project = { id: makeId(), name: cleanName(name, `Projekt ${store.projects.length + 1}`), items: [], activeItemId: null };
  const withItem = addItem({ ...store, projects: [...store.projects, project], activeProjectId: project.id }, project.id, 'kastenbuehne');
  return withItem.store;
}

export function renameProject(store: ProjectStore, projectId: string, name: string): ProjectStore {
  return updateProject(store, projectId, (p) => ({ ...p, name: cleanName(name, p.name) }));
}

/** Entfernt ein Projekt. Das letzte Projekt bleibt bestehen (es wird stattdessen geleert zurückgegeben). */
export function removeProject(store: ProjectStore, projectId: string): { store: ProjectStore; removedItems: ProjectItem[] } {
  const removed = store.projects.find((p) => p.id === projectId);
  if (!removed) return { store, removedItems: [] };
  const remaining = store.projects.filter((p) => p.id !== projectId);
  if (remaining.length === 0) {
    // Der Speicher der entfernten Tische wird vom Aufrufer geleert; die neuen Standard-Tische starten leer.
    return { store: createDefaultStore(), removedItems: removed.items };
  }
  return {
    store: { ...store, projects: remaining, activeProjectId: store.activeProjectId === projectId ? remaining[0].id : store.activeProjectId },
    removedItems: removed.items,
  };
}

export function setActiveProject(store: ProjectStore, projectId: string): ProjectStore {
  return store.projects.some((p) => p.id === projectId) ? { ...store, activeProjectId: projectId } : store;
}

/** Neuer Tisch mit eigenem Speicherort; wird sofort aktiv. */
export function addItem(
  store: ProjectStore,
  projectId: string,
  kind: PlanKind,
  name?: string,
): { store: ProjectStore; item: ProjectItem } {
  const project = store.projects.find((p) => p.id === projectId)!;
  const id = makeId();
  const item: ProjectItem = { id, name: cleanName(name ?? '', nextItemName(project.items, kind)), kind, namespace: `item-${id}` };
  return {
    item,
    store: updateProject(store, projectId, (p) => ({ ...p, items: [...p.items, item], activeItemId: item.id })),
  };
}

export function renameItem(store: ProjectStore, projectId: string, itemId: string, name: string): ProjectStore {
  return updateProject(store, projectId, (p) => ({
    ...p,
    items: p.items.map((i) => (i.id === itemId ? { ...i, name: cleanName(name, i.name) } : i)),
  }));
}

export function removeItem(store: ProjectStore, projectId: string, itemId: string): { store: ProjectStore; removed: ProjectItem | null } {
  const project = store.projects.find((p) => p.id === projectId);
  const removed = project?.items.find((i) => i.id === itemId) ?? null;
  if (!project || !removed) return { store, removed: null };
  const items = project.items.filter((i) => i.id !== itemId);
  const activeItemId = project.activeItemId === itemId ? (items[0]?.id ?? null) : project.activeItemId;
  return { store: updateProject(store, projectId, (p) => ({ ...p, items, activeItemId })), removed };
}

export function setActiveItem(store: ProjectStore, projectId: string, itemId: string | null): ProjectStore {
  return updateProject(store, projectId, (p) => ({
    ...p,
    activeItemId: itemId === null || p.items.some((i) => i.id === itemId) ? itemId : p.activeItemId,
  }));
}

/** Prüft gelesene Daten aus dem Speicher; null, wenn sie unbrauchbar sind. */
export function parseStore(raw: unknown): ProjectStore | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !Array.isArray(r.projects) || r.projects.length === 0) return null;
  const projects: Project[] = [];
  for (const p of r.projects) {
    if (typeof p !== 'object' || p === null) return null;
    const pr = p as Record<string, unknown>;
    if (typeof pr.id !== 'string' || typeof pr.name !== 'string' || !Array.isArray(pr.items)) return null;
    const items: ProjectItem[] = [];
    for (const i of pr.items) {
      if (typeof i !== 'object' || i === null) return null;
      const it = i as Record<string, unknown>;
      if (
        typeof it.id !== 'string' ||
        typeof it.name !== 'string' ||
        typeof it.namespace !== 'string' ||
        (it.kind !== 'kastenbuehne' && it.kind !== 'tresen')
      ) {
        return null;
      }
      items.push({ id: it.id, name: it.name, kind: it.kind, namespace: it.namespace });
    }
    const activeItemId = typeof pr.activeItemId === 'string' && items.some((x) => x.id === pr.activeItemId) ? pr.activeItemId : (items[0]?.id ?? null);
    projects.push({ id: pr.id, name: pr.name, items, activeItemId });
  }
  const activeProjectId = typeof r.activeProjectId === 'string' && projects.some((p) => p.id === r.activeProjectId) ? r.activeProjectId : projects[0].id;
  return { version: 1, activeProjectId, projects };
}

/** Neues Projekt aus importierten Tischen (neue IDs und Speicherorte); wird sofort aktiv. */
export function addImportedProject(
  store: ProjectStore,
  name: string,
  items: Array<{ name: string; kind: PlanKind }>,
): { store: ProjectStore; items: ProjectItem[] } {
  const made: ProjectItem[] = items.map((i) => {
    const id = makeId();
    return { id, name: cleanName(i.name, i.kind === 'tresen' ? 'Tresen' : 'Bühne'), kind: i.kind, namespace: `item-${id}` };
  });
  const project: Project = {
    id: makeId(),
    name: cleanName(name, `Projekt ${store.projects.length + 1}`),
    items: made,
    activeItemId: made[0]?.id ?? null,
  };
  return { store: { ...store, projects: [...store.projects, project], activeProjectId: project.id }, items: made };
}
