import { ACTION_BTN } from './styles';

interface ZoomControlsProps {
  /** Zoomstufe in Prozent (100 % = Ausgangsausschnitt). */
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Passt den ganzen Plan wieder ins Bild. */
  onFit: () => void;
}

/** Zoom-Schalter für die Editor-Toolbar: herauszoomen, Anzeige in %, hineinzoomen, einpassen. Reine Darstellung. */
export function ZoomControls({ zoomPercent, onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  return (
    <div role="group" aria-label="Zoom" className="flex items-center gap-1">
      <button type="button" onClick={onZoomOut} aria-label="Herauszoomen" title="Herauszoomen" className={ACTION_BTN}>
        −
      </button>
      <span className="min-w-[3.25rem] text-center text-xs tabular-nums text-[var(--color-text-muted)]" aria-live="polite">
        {zoomPercent} %
      </span>
      <button type="button" onClick={onZoomIn} aria-label="Hineinzoomen" title="Hineinzoomen" className={ACTION_BTN}>
        +
      </button>
      <button type="button" onClick={onFit} title="Ganzen Plan zeigen (0)" className={ACTION_BTN}>
        Einpassen
      </button>
    </div>
  );
}
