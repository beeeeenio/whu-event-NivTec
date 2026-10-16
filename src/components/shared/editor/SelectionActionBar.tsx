import { ACTION_BTN } from './styles';

export interface SelectionAction {
  key: string;
  label: string;
  ariaLabel?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Schwebende Aktionsleiste über der Auswahl im Plan. Reine Darstellung: Position (Pixel relativ zum
 *  Plan-Wrapper) und Aktionen kommen vom Editor, der auch entscheidet, welche Schalter gelten. */
export function SelectionActionBar({ left, top, actions }: { left: number; top: number; actions: SelectionAction[] }) {
  return (
    <div
      role="toolbar"
      aria-label="Aktionen für die Auswahl"
      className="absolute z-10 flex gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-md"
      style={{ left, top }}
    >
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={a.onClick}
          disabled={a.disabled}
          aria-label={a.ariaLabel}
          className={ACTION_BTN}
          style={a.danger ? { color: 'var(--color-danger)' } : undefined}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
