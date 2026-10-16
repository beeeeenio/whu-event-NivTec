import { ACTION_BTN } from './styles';

interface EditorToolbarProps {
  statusText: string;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  canRotate: boolean;
  onRotate: () => void;
  canDuplicate: boolean;
  onDuplicate: () => void;
  showMirror: boolean;
  onMirror: () => void;
  removeCount: number;
  onRemove: () => void;
  cancelLabel: 'Abbrechen' | 'Abwählen' | null;
  onCancel: () => void;
  piecesCount: number;
  canShiftLeft: boolean;
  onShiftAll: (dx: number) => void;
  shiftStepM: number;
  onClear?: () => void;
  /** Platz für weitere Schalter (Zoom, Maße, Sperren …) vor der rechten Gruppe. */
  extra?: React.ReactNode;
  /** Mehrfachauswahl per Antippen (Touch ohne Umschalttaste); ohne onToggleMultiSelect gibt es keinen Schalter. */
  multiSelect?: boolean;
  onToggleMultiSelect?: () => void;
}

/** Aktionsleiste über dem Plan: Statustext, Rückgängig/Wiederholen, Drehen, Duplizieren, Spiegeln,
 *  Entfernen, Abwählen/Abbrechen sowie "Alles verschieben" und Plan leeren. Reine Darstellung —
 *  alle Entscheidungen (ob ein Schalter aktiv ist) trifft der Editor und reicht sie als Props herein. */
export function EditorToolbar({
  statusText,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  canRotate,
  onRotate,
  canDuplicate,
  onDuplicate,
  showMirror,
  onMirror,
  removeCount,
  onRemove,
  cancelLabel,
  onCancel,
  piecesCount,
  canShiftLeft,
  onShiftAll,
  shiftStepM,
  onClear,
  extra,
  multiSelect,
  onToggleMultiSelect,
}: EditorToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Aktionen"
      className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2"
    >
      <span role="status" className="mr-1 text-xs text-[var(--color-text-muted)]">
        {statusText}
      </span>
      {onUndo && (
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Rückgängig (Strg/Cmd+Z)" aria-label="Rückgängig" className={ACTION_BTN}>
          ↶
        </button>
      )}
      {onRedo && (
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Wiederholen (Strg/Cmd+Umschalt+Z oder Strg+Y)" aria-label="Wiederholen" className={ACTION_BTN}>
          ↷
        </button>
      )}
      <button
        type="button"
        onClick={onRotate}
        disabled={!canRotate}
        title="Drehen (R) — wirkt auf das gewählte oder gerade aufgenommene Stück"
        className={ACTION_BTN}
      >
        ⤾ Drehen
      </button>
      <button type="button" onClick={onDuplicate} disabled={!canDuplicate} title="Duplizieren (Strg/Cmd+D)" className={ACTION_BTN}>⧉ Duplizieren</button>
      {showMirror && (
        <button type="button" onClick={onMirror} title="Spiegeln — wechselt links/rechts" className={ACTION_BTN}>
          ⇋ Spiegeln
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={removeCount === 0}
        title="Entfernen (Entf)"
        className={`${ACTION_BTN} enabled:hover:!border-[var(--color-danger)] enabled:hover:!text-[var(--color-danger)]`}
      >
        {removeCount > 1 ? `Entfernen (${removeCount})` : 'Entfernen'}
      </button>
      {onToggleMultiSelect && (
        <button
          type="button"
          onClick={onToggleMultiSelect}
          aria-pressed={!!multiSelect}
          title="Tippen fügt Stücke zur Auswahl hinzu bzw. entfernt sie – für Touch"
          className={`${ACTION_BTN} ${multiSelect ? '!border-[var(--color-accent)] !text-[var(--color-accent)]' : ''}`}
        >
          Mehrfachauswahl
        </button>
      )}
      {cancelLabel && (
        <button type="button" onClick={onCancel} className="px-2 py-1 text-xs text-[var(--color-text-muted)] underline">
          {cancelLabel}
        </button>
      )}
      {extra}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {piecesCount > 0 && (
          <div className="flex items-center gap-1.5" role="group" aria-label="Ganze Fläche verschieben">
            <span className="text-xs text-[var(--color-text-muted)]">Alles verschieben</span>
            <button
              type="button"
              onClick={() => onShiftAll(-shiftStepM)}
              disabled={!canShiftLeft}
              title={canShiftLeft ? 'Alle Stücke gemeinsam 0,5 m nach links (Umschalt+← ohne Auswahl)' : 'Die Fläche liegt schon am linken Rand'}
              aria-label="Alle Stücke 0,5 m nach links verschieben"
              className={ACTION_BTN}
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => onShiftAll(shiftStepM)}
              title="Alle Stücke gemeinsam 0,5 m nach rechts (Umschalt+→ ohne Auswahl)"
              aria-label="Alle Stücke 0,5 m nach rechts verschieben"
              className={ACTION_BTN}
            >
              →
            </button>
          </div>
        )}
        {onClear && piecesCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            title="Leert den ganzen Plan – lässt sich rückgängig machen"
            className={`${ACTION_BTN} enabled:hover:!border-[var(--color-danger)] enabled:hover:!text-[var(--color-danger)]`}
          >
            Plan leeren
          </button>
        )}
      </div>
    </div>
  );
}
