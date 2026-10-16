import { memo } from 'react';
import { QUARTER_CIRCLE_RADIUS_M, RECT_CATALOG } from '../../../domain/panels';
import { payloadMatches, type ToolPayload } from '../../../domain/toolPayload';
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

export interface PiecePaletteProps {
  armed: ToolPayload | null;
  onTilePointerDown: (e: React.PointerEvent<HTMLButtonElement>, payload: ToolPayload) => void;
  onTilePointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onTilePointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onTileCancel: () => void;
  onTileClick: (payload: ToolPayload, isArmed: boolean) => void;
  hint: string;
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
}: PiecePaletteProps) {
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
          {group.tiles.map((tile) => {
            const isArmed = payloadMatches(armed, tile.payload);
            const g = tile.geometry;
            const scale = 24;
            return (
              <button
                key={tile.key}
                type="button"
                onPointerDown={(e) => onTilePointerDown(e, tile.payload)}
                onPointerMove={onTilePointerMove}
                onPointerUp={onTilePointerUp}
                onPointerCancel={onTileCancel}
                onLostPointerCapture={onTileCancel}
                onClick={() => onTileClick(tile.payload, isArmed)}
                aria-pressed={isArmed}
                aria-label={`${group.title === 'Rechtecke' ? 'Stück' : group.title === 'Dreiecke' ? 'Dreieckpodest' : 'Viertelkreis'} ${tile.label} m ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`.trim()}
                title={tile.payload.kind === 'viertelkreis' ? 'Viertelkreis, Radius 1 m' : `${tile.label} m`}
                className={`flex min-w-[3.25rem] cursor-pointer select-none touch-none flex-col items-center gap-1 rounded-md border px-2 py-1.5 ${
                  isArmed
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                    : 'border-[var(--color-panel-stroke)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
                }`}
              >
                <span className="flex h-[52px] items-end">
                  <svg
                    width={g.w * scale + 4}
                    height={g.d * scale + 4}
                    viewBox={`-0.08 -0.08 ${g.w + 0.16} ${g.d + 0.16}`}
                    aria-hidden
                  >
                    <PieceShape
                      piece={g}
                      fill={isArmed ? 'rgba(255,255,255,0.35)' : 'var(--color-panel-fill)'}
                      stroke={isArmed ? 'currentColor' : 'var(--color-panel-stroke)'}
                      strokeWidth={0.06}
                    />
                  </svg>
                </span>
                <span className="text-[11px] leading-none" style={{ fontFamily: 'var(--font-mono)' }}>
                  {tile.label}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      </div>
      ))}
      </div>
    </div>
  );
});
