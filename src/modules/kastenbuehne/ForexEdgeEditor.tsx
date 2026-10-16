import type { Piece2D } from '../../domain/customShape';
import { forexKey, freeEdges } from '../../domain/forex';
import { quarterCirclePath, trianglePoints } from '../../domain/triangle';
import type { ForexPanel, ForexSide } from '../../domain/types';

interface Props {
  /** Stücke in normalisierten Plan-Koordinaten (wie für Grundriss/3D). */
  pieces: Piece2D[];
  forexPanels: ForexPanel[];
  onToggle: (pieceId: string, side: ForexSide) => void;
  onAllFrontEdges: () => void;
  onClear: () => void;
}

const SIDE_LABELS: Record<ForexSide, string> = {
  top: 'Hinterkante',
  bottom: 'Vorderkante',
  left: 'linke Kante',
  right: 'rechte Kante',
  hyp: 'Schräge',
};

/**
 * Grundriss nur für die Forex-Blenden: an jeder freien Außenkante ein Schalter „Forex“.
 * Kanten, an denen ein Nachbarpodest anliegt, bekommen keinen Schalter.
 */
export function ForexEdgeEditor({ pieces, forexPanels, onToggle, onAllFrontEdges, onClear }: Props) {
  if (pieces.length === 0) return null;

  const edges = freeEdges(pieces);
  const active = new Set(forexPanels.map((p) => forexKey(p.pieceId, p.side)));
  const activeCount = edges.filter((e) => active.has(forexKey(e.pieceId, e.side))).length;

  const maxX = Math.max(...pieces.map((p) => p.x + p.w));
  const maxY = Math.max(...pieces.map((p) => p.y + p.d));
  const pad = 0.7;
  const pillW = 0.62;
  const pillH = 0.24;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAllFrontEdges}
          className="px-3 py-1.5 rounded-md text-sm border bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]"
        >
          Alle Vorderkanten
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={activeCount === 0}
          className="px-3 py-1.5 rounded-md text-sm border bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-danger)] disabled:opacity-50"
        >
          Alle entfernen
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">
          {activeCount} von {edges.length} freien Außenkanten mit Forex-Blende
        </span>
      </div>
      <svg
        viewBox={`${-pad} ${-pad} ${maxX + pad * 2} ${maxY + pad * 2}`}
        className="w-full h-auto max-h-[360px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
        role="group"
        aria-label="Forex-Blenden je Außenkante"
      >
        {pieces.map((p) =>
          p.corner === undefined ? (
            <rect key={p.id} x={p.x} y={p.y} width={p.w} height={p.d} fill="var(--color-panel-fill)" stroke="var(--color-panel-stroke)" strokeWidth={0.02} />
          ) : p.shape === 'viertelkreis' ? (
            <path key={p.id} d={quarterCirclePath(p, p.corner)} fill="var(--color-panel-fill)" stroke="var(--color-panel-stroke)" strokeWidth={0.02} />
          ) : (
            <polygon
              key={p.id}
              points={trianglePoints(p, p.corner).map((pt) => `${pt.x},${pt.y}`).join(' ')}
              fill="var(--color-panel-fill)"
              stroke="var(--color-panel-stroke)"
              strokeWidth={0.02}
            />
          ),
        )}
        {edges.map((e) => {
          const key = forexKey(e.pieceId, e.side);
          const on = active.has(key);
          const mx = (e.x1 + e.x2) / 2 + e.nx * 0.2;
          const my = (e.y1 + e.y2) / 2 + e.ny * 0.2;
          const label = `Forex an ${SIDE_LABELS[e.side]} (${(Math.round(e.lengthM * 100) / 100).toString().replace('.', ',')} m)`;
          const toggle = () => onToggle(e.pieceId, e.side);
          return (
            <g
              key={key}
              role="switch"
              aria-checked={on}
              aria-label={label}
              tabIndex={0}
              onClick={toggle}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  toggle();
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>{label}</title>
              <line
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={on ? 'var(--color-accent)' : 'var(--color-grid-line)'}
                strokeWidth={on ? 0.08 : 0.04}
                strokeLinecap="round"
              />
              <rect
                x={mx - pillW / 2}
                y={my - pillH / 2}
                width={pillW}
                height={pillH}
                rx={pillH / 2}
                fill={on ? 'var(--color-accent)' : 'var(--color-surface)'}
                stroke="var(--color-accent)"
                strokeWidth={0.02}
              />
              <text
                x={mx}
                y={my + 0.055}
                fontSize={0.15}
                textAnchor="middle"
                fill={on ? 'var(--color-accent-contrast)' : 'var(--color-accent)'}
                fontWeight={700}
              >
                Forex
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-[var(--color-text-muted)]">
        Schalter „Forex“ an jeder freien Außenkante: 5-mm-Platte direkt vor der Kante, vom Boden bis 1 cm unter die
        Belag-Oberkante. Vorderkante = unten im Plan. Druckbilder werden nicht mit exportiert.
      </p>
    </div>
  );
}
