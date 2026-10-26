import { useEffect, useState } from 'react';
import type { Project } from '../../domain/project';
import { projectMaterial, type ItemMaterial } from '../../domain/projectMaterial';
import { materialListToCsv } from '../../lib/csv';
import { downloadTextFile } from '../../lib/download';
import { readItemDraft } from '../../lib/projectStore';
import type { MaterialListItem } from '../../domain/types';
import { MaterialListTable } from './MaterialListTable';

/** Gesamtliste aller Tische eines Projekts, mit Aufschlüsselung je Tisch. */
export function ProjectMaterialView({ project }: { project: Project }) {
  // Erst nach dem Einhängen lesen: der zuvor offene Tisch sichert beim Verlassen noch seinen letzten Stand.
  const [data, setData] = useState<{ perItem: ItemMaterial[]; total: MaterialListItem[] } | null>(null);
  useEffect(() => {
    setData(projectMaterial(project.items, readItemDraft));
  }, [project]);

  if (!data) return null;
  const empty = data.perItem.filter((p) => p.list.length === 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Gesamtliste — {project.name}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Alle Tische des Projekts zusammen ({project.items.length} {project.items.length === 1 ? 'Tisch' : 'Tische'}).
          </p>
        </div>
        <button
          type="button"
          disabled={data.total.length === 0}
          onClick={() =>
            downloadTextFile(`${project.name.replace(/[\\/:*?"<>|]+/g, '') || 'projekt'}-gesamtliste.csv`, materialListToCsv(data.total), 'text/csv;charset=utf-8', true)
          }
          className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          CSV Export
        </button>
      </div>

      {empty.length > 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Noch ohne Stücke und deshalb nicht in der Liste: {empty.map((p) => p.item.name).join(', ')}.
        </p>
      )}

      <MaterialListTable items={data.total} />

      {data.perItem.some((p) => p.list.length > 0) && (
        <details className="space-y-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-[var(--color-text)]">Nach Tisch aufschlüsseln</summary>
          <div className="mt-3 space-y-5">
            {data.perItem
              .filter((p) => p.list.length > 0)
              .map((p) => (
                <section key={p.item.id} className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">{p.item.name}</h3>
                  <MaterialListTable items={p.list} />
                </section>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
