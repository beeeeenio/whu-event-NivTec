import { memo } from 'react';
import { QUARTER_CIRCLE_RADIUS_M, RECT_CATALOG } from '../../../domain/panels';
import { payloadMatches, payloadSize, type ToolPayload } from '../../../domain/toolPayload';
import { PieceShape, type ShapeGeometry } from './PieceShape';

const fmtDim = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

interface GalleryTile {
  key: string;
  label: string;
  payload: ToolPayload;
  geometry: ShapeGeometry;
}

const GALLERY_GROUPS: { title: string; tiles: GalleryTile[] }[] = [
  {
    title: 'Rechtecke',
    tiles: [...RECT_CATALOG]
      .sort((a, b) => b.w - a.w || b.d - a.d)
      .map((r) => ({
        key: `rect-${r.w}x${r.d}`,
        label: `${fmtDim(r.w)}×${fmtDim(r.d)}`,
        payload: { kind: 'piece', w: r.w, d: r.d } as ToolPayload,
        geometry: { x: 0, y: 0, w: r.w, d: r.d },
      })),
  },
  {
    title: 'Dreiecke',
    tiles: [
      { key: 'tri-1x1', label: '1×1', payload: { kind: 'triangle', corner: 'tl', w: 1, d: 1 }, geometry: { x: 0, y: 0, w: 1, d: 1, corner: 'tl' } },
      { key: 'tri-2x1', label: '2×1', payload: { kind: 'triangle', corner: 'tl', w: 2, d: 1 }, geometry: { x: 0, y: 0, w: 2, d: 1, corner: 'tl' } },
    ],
  },
  {
    title: 'Rund',
    tiles: [
      {
        key: 'quarter',
        label: 'R 1',
        payload: { kind: 'viertelkreis', corner: 'tl' },
        geometry: { x: 0, y: 0, w: QUARTER_CIRCLE_RADIUS_M, d: QUARTER_CIRCLE_RADIUS_M, corner: 'tl', shape: 'viertelkreis' },
      },
    ],
  },
];

/** Eigener Baustein in der Palette: Name, Nutzlast und Löschen-Aktion (vom Editor per useMemo stabil übergeben). */
export interface PaletteBlock {
  payload: ToolPayload;
  key: string;
  label: string;
  onDelete: () => void;
}

export interface PiecePaletteProps {
  armed: ToolPayload | null;
  onTilePointerDown: (e: React.PointerEvent<HTMLButtonElement>, payload: ToolPayload) => void;
  onTilePointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onTilePointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onTileCancel: () => void;
  onTileClick: (payload: ToolPayload, isArmed: boolean) => void;
  hint: string;
  /** Eigene Bausteine (Gruppe „Eigene Bausteine“); fehlt die Prop, gibt es keine Gruppe. */
  blocks?: PaletteBlock[];
}

type TileHandlers = Pick<PiecePaletteProps, 'onTilePointerDown' | 'onTilePointerMove' | 'onTilePointerUp' | 'onTileCancel' | 'onTileClick'>;

/** Anzeige einer Kachel: Stücke im Mini-SVG, Maße in m für die Skalierung, Namen für Screenreader und Hinweis. */
interface TileView {
  key: string;
  label: string;
  payload: ToolPayload;
  shapes: ShapeGeometry[];
  box: { w: number; d: number };
  scale: number;
  name: string;
  title: string;
}

/** Eine Kachel mit Klick-Bewaffnen und Ziehen aus der Kachel auf den Plan (Maus und Touch). */
function PaletteTile({ view, armed, handlers }: { view: TileView; armed: ToolPayload | null; handlers: TileHandlers }) {
  const isArmed = payloadMatches(armed, view.payload);
  const { box, scale } = view;
  return (
    <button
      type="button"
      onPointerDown={(e) => handlers.onTilePointerDown(e, view.payload)}
      onPointerMove={handlers.onTilePointerMove}
      onPointerUp={handlers.onTilePointerUp}
      onPointerCancel={handlers.onTileCancel}
      onLostPointerCapture={handlers.onTileCancel}
      onClick={() => handlers.onTileClick(view.payload, isArmed)}
      aria-pressed={isArmed}
      aria-label={`${view.name} ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`}
      title={view.title}
      className={`flex min-w-[3.25rem] cursor-pointer select-none touch-none flex-col items-center gap-1 rounded-md border px-2 py-1.5 ${
        isArmed
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
          : 'border-[var(--color-panel-stroke)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
      }`}
    >
      <span className="flex h-[52px] items-end">
        <svg width={box.w * scale + 4} height={box.d * scale + 4} viewBox={`-0.08 -0.08 ${box.w + 0.16} ${box.d + 0.16}`} aria-hidden>
          {view.shapes.map((s, i) => (
            <PieceShape
              key={i}
              piece={s}
              fill={isArmed ? 'rgba(255,255,255,0.35)' : 'var(--color-panel-fill)'}
              stroke={isArmed ? 'currentColor' : 'var(--color-panel-stroke)'}
              strokeWidth={0.06}
            />
          ))}
        </svg>
      </span>
      <span className="text-[11px] leading-none" style={{ fontFamily: 'var(--font-mono)' }}>
        {view.label}
      </span>
    </button>
  );
}

/** Palette der Stückkacheln: Klick bewaffnet, Ziehen aus der Kachel auf den Plan (Maus und Touch).
 *  memo, damit Renders des Editors (Hover, Ziehen auf dem Plan) die Kacheln nicht neu zeichnen. */
export const PiecePalette = memo(function PiecePalette({
  armed,
  onTilePointerDown,
  onTilePointerMove,
  onTilePointerUp,
  onTileCancel,
  onTileClick,
  hint,
  blocks = [],
}: PiecePaletteProps) {
  const handlers: TileHandlers = { onTilePointerDown, onTilePointerMove, onTilePointerUp, onTileCancel, onTileClick };
  return (
    <div className="space-y-2" style={{ fontFamily: 'var(--font-display)' }}>
      <p className="text-xs text-[var(--color-text-muted)]">
        {hint}
      </p>
      <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
      {[GALLERY_GROUPS.slice(0, 1), GALLERY_GROUPS.slice(1)].map((column, colIdx) => (
      <div key={colIdx} className={`flex gap-x-6 gap-y-3 ${colIdx === 0 ? 'max-w-[34rem] flex-wrap' : 'flex-wrap'}`}>
      {column.map((group) => (
        <div key={group.title} className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
          <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {group.title}
          </span>
          {group.tiles.map((tile) => (
            <PaletteTile
              key={tile.key}
              armed={armed}
              handlers={handlers}
              view={{
                key: tile.key,
                label: tile.label,
                payload: tile.payload,
                shapes: [tile.geometry],
                box: { w: tile.geometry.w, d: tile.geometry.d },
                scale: 24,
                name: `${group.title === 'Rechtecke' ? 'Stück' : group.title === 'Dreiecke' ? 'Dreieckpodest' : 'Viertelkreis'} ${tile.label} m`,
                title: tile.payload.kind === 'viertelkreis' ? 'Viertelkreis, Radius 1 m' : `${tile.label} m`,
              }}
            />
          ))}
        </div>
      ))}
      </div>
      ))}
      </div>
      {blocks.length > 0 && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
          <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Eigene Bausteine
          </span>
          {blocks.map((b) => {
            const box = payloadSize(b.payload);
            const pieces = b.payload.kind === 'block' ? b.payload.pieces : [];
            return (
              <div key={b.key} className="flex items-start gap-0.5">
                <PaletteTile
                  armed={armed}
                  handlers={handlers}
                  view={{
                    key: b.key,
                    label: b.label,
                    payload: b.payload,
                    shapes: pieces,
                    box,
                    // Ein Baustein darf die Kachel nicht sprengen: höchstens 48 px hoch bzw. breit.
                    scale: Math.min(24, 48 / Math.max(box.w, box.d, 0.01)),
                    name: `Baustein ${b.label}`,
                    title: `Baustein ${b.label}`,
                  }}
                />
                <button
                  type="button"
                  onClick={b.onDelete}
                  aria-label={`Baustein ${b.label} löschen`}
                  title="Baustein löschen"
                  className="cursor-pointer rounded px-1 text-sm leading-none text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
