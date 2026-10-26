import { useState } from 'react';
import { KIND_LABEL, type Project, type ProjectItem, type ProjectStore } from '../../domain/project';
import type { PlanKind } from '../../domain/migrations';
import { NameInput } from './NameInput';

export type ProjectView = 'item' | 'total';

interface Props {
  store: ProjectStore;
  project: Project;
  activeItem: ProjectItem | null;
  view: ProjectView;
  onView: (view: ProjectView) => void;
  actions: {
    selectProject: (id: string) => void;
    createProject: (name: string) => void;
    renameProject: (id: string, name: string) => void;
    deleteProject: (id: string) => void;
    selectItem: (id: string) => void;
    createItem: (kind: PlanKind) => void;
    renameItem: (id: string, name: string) => void;
    deleteItem: (id: string) => void;
    duplicateItem: (id: string) => void;
  };
  saveFailed: boolean;
}

const SMALL_BTN =
  'px-2 py-1 rounded-md text-xs border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]';

type Editing = 'none' | 'newProject' | 'renameProject' | 'renameItem' | 'addItem';

/** Projektauswahl und Tisch-Reiter inklusive "Gesamtliste". */
export function ProjectBar({ store, project, activeItem, view, onView, actions, saveFailed }: Props) {
  const [editing, setEditing] = useState<Editing>('none');
  const stop = () => setEditing('none');

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="max-w-4xl mx-auto px-4 pt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Projekt</span>
          {editing === 'newProject' ? (
            <NameInput
              initial={`Projekt ${store.projects.length + 1}`}
              label="Name des neuen Projekts"
              confirmLabel="Anlegen"
              onConfirm={(name) => {
                actions.createProject(name);
                onView('item');
                stop();
              }}
              onCancel={stop}
            />
          ) : editing === 'renameProject' ? (
            <NameInput
              initial={project.name}
              label="Projektname"
              onConfirm={(name) => {
                actions.renameProject(project.id, name);
                stop();
              }}
              onCancel={stop}
            />
          ) : (
            <>
              <select
                value={project.id}
                aria-label="Projekt wählen"
                onChange={(e) => {
                  actions.selectProject(e.target.value);
                  onView('item');
                }}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
              >
                {store.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" className={SMALL_BTN} onClick={() => setEditing('newProject')}>
                Neues Projekt
              </button>
              <button type="button" className={SMALL_BTN} onClick={() => setEditing('renameProject')}>
                Umbenennen
              </button>
              <button
                type="button"
                className={`${SMALL_BTN} hover:!border-[var(--color-danger)] hover:!text-[var(--color-danger)]`}
                onClick={() => {
                  if (window.confirm(`Projekt „${project.name}“ mit allen ${project.items.length} Tischen löschen? Das kann nicht rückgängig gemacht werden.`)) {
                    actions.deleteProject(project.id);
                    onView('item');
                  }
                }}
              >
                Löschen
              </button>
            </>
          )}
          {saveFailed && (
            <span role="alert" className="text-xs text-[var(--color-danger)]">
              Projekte konnten nicht im Browser gespeichert werden.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Tische">
          {project.items.map((item) => {
            const selected = view === 'item' && activeItem?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  actions.selectItem(item.id);
                  onView('item');
                  stop();
                }}
                className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  selected
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {item.name}
                <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-60">{KIND_LABEL[item.kind]}</span>
              </button>
            );
          })}
          {editing === 'addItem' ? (
            <span className="flex items-center gap-1.5 px-1">
              <button
                type="button"
                className={SMALL_BTN}
                onClick={() => {
                  actions.createItem('kastenbuehne');
                  onView('item');
                  stop();
                }}
              >
                Bühne
              </button>
              <button
                type="button"
                className={SMALL_BTN}
                onClick={() => {
                  actions.createItem('tresen');
                  onView('item');
                  stop();
                }}
              >
                Tresen
              </button>
              <button type="button" onClick={stop} className="text-xs text-[var(--color-text-muted)] underline">
                Abbrechen
              </button>
            </span>
          ) : (
            <button type="button" className={`${SMALL_BTN} ml-1`} onClick={() => setEditing('addItem')}>
              + Tisch hinzufügen
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={view === 'total'}
            onClick={() => {
              onView('total');
              stop();
            }}
            className={`ml-auto px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              view === 'total'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Gesamtliste
          </button>
        </div>

        {view === 'item' && activeItem && (
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {editing === 'renameItem' ? (
              <NameInput
                initial={activeItem.name}
                label="Name des Tisches"
                onConfirm={(name) => {
                  actions.renameItem(activeItem.id, name);
                  stop();
                }}
                onCancel={stop}
              />
            ) : (
              <>
                <span className="text-xs text-[var(--color-text-muted)]">Tisch „{activeItem.name}“:</span>
                <button type="button" className={SMALL_BTN} onClick={() => setEditing('renameItem')}>
                  Umbenennen
                </button>
                <button type="button" className={SMALL_BTN} onClick={() => actions.duplicateItem(activeItem.id)}>
                  Duplizieren
                </button>
                <button
                  type="button"
                  className={`${SMALL_BTN} hover:!border-[var(--color-danger)] hover:!text-[var(--color-danger)]`}
                  onClick={() => {
                    if (window.confirm(`Tisch „${activeItem.name}“ löschen? Sein Plan geht dabei verloren.`)) {
                      actions.deleteItem(activeItem.id);
                    }
                  }}
                >
                  Löschen
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
