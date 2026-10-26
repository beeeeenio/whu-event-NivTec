import type { PlanKind } from './migrations';
import type { Project, ProjectItem } from './project';
import { parseKastenbuehneFile, parseTresenFile } from './savedState';

export const PROJECT_FILE_FORMAT = 'nivtec-projekt';

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT;
  version: 1;
  name: string;
  tische: Array<{ name: string; kind: PlanKind; plan: unknown }>;
}

/** Baut die Projektdatei: alle Tische mit ihrem gespeicherten Plan (leere Tische ohne Plan als null). */
export function buildProjectFile(project: Project, readDraft: (item: ProjectItem) => unknown): ProjectFile {
  return {
    format: PROJECT_FILE_FORMAT,
    version: 1,
    name: project.name,
    tische: project.items.map((item) => ({ name: item.name, kind: item.kind, plan: readDraft(item) ?? null })),
  };
}

export type ProjectFileResult =
  | { ok: true; name: string; tische: ProjectFile['tische']; notes: string[] }
  | { ok: false; error: string };

/** Prüft eine Projektdatei. Unlesbare Pläne einzelner Tische werden verworfen (der Tisch bleibt leer) und gemeldet. */
export function parseProjectFile(data: unknown): ProjectFileResult {
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'Das ist keine Projektdatei.' };
  const d = data as Record<string, unknown>;
  if (d.format !== PROJECT_FILE_FORMAT) {
    return {
      ok: false,
      error: 'Das ist keine Projektdatei. Einzelne Pläne öffnest du im jeweiligen Tisch über „Plan-Datei öffnen“.',
    };
  }
  if (d.version !== 1) return { ok: false, error: 'Diese Projektdatei stammt aus einer neueren Version des Tools.' };
  if (!Array.isArray(d.tische)) return { ok: false, error: 'In der Projektdatei fehlen die Tische.' };

  const notes: string[] = [];
  const tische: ProjectFile['tische'] = [];
  d.tische.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      notes.push(`Tisch ${index + 1} war ungültig und wurde übersprungen.`);
      return;
    }
    const t = raw as Record<string, unknown>;
    if (t.kind !== 'kastenbuehne' && t.kind !== 'tresen') {
      notes.push(`Tisch ${index + 1} hat eine unbekannte Art und wurde übersprungen.`);
      return;
    }
    const name = typeof t.name === 'string' ? t.name : `Tisch ${index + 1}`;
    let plan: unknown = null;
    if (t.plan !== null && t.plan !== undefined) {
      const parsed = t.kind === 'kastenbuehne' ? parseKastenbuehneFile(t.plan) : parseTresenFile(t.plan);
      if (parsed.ok) plan = t.plan;
      else notes.push(`Plan von „${name}“ war nicht lesbar (${parsed.error}) – der Tisch startet leer.`);
    }
    tische.push({ name, kind: t.kind, plan });
  });
  if (tische.length === 0) return { ok: false, error: 'Die Projektdatei enthält keinen brauchbaren Tisch.' };
  return { ok: true, name: typeof d.name === 'string' ? d.name : 'Importiertes Projekt', tische, notes };
}
