import type { FilledPiece, Piece2D } from '../../../domain/customShape';
import type { AlignmentGuide, GapMeasure, Rect } from '../../../domain/smartGuides';
import { formatMeters } from '../../../lib/format';
import { DimensionLabel, PieceShape } from './PieceShape';
import type { DragState } from './types';

/** Smart Guides beim Ziehen: Fluchtlinien, Abstandsmaße zu Nachbarn/Rand und das Gesamtmaß.
 *  Alles in Metern; Strichstärken und Schrift werden über px umgerechnet, damit sie bei jeder
 *  Zoomstufe gleich groß wirken. Reines Hinweis-Overlay (pointerEvents none). */
function SmartGuidesLayer({
  guides,
  gaps,
  total,
  px,
}: {
  guides: AlignmentGuide[];
  gaps: GapMeasure[];
  total: Rect | null;
  px: number;
}) {
  return (
    <g pointerEvents="none">
      {guides.map((g, i) =>
        g.axis === 'x' ? (
          <line
            key={`guide-${i}`}
            x1={g.pos}
            x2={g.pos}
            y1={g.from - 6 * px}
            y2={g.to + 6 * px}
            stroke="var(--color-accent)"
            strokeWidth={px}
            strokeDasharray={`${4 * px} ${3 * px}`}
            opacity={g.kind === 'border' ? 0.6 : undefined}
          />
        ) : (
          <line
            key={`guide-${i}`}
            y1={g.pos}
            y2={g.pos}
            x1={g.from - 6 * px}
            x2={g.to + 6 * px}
            stroke="var(--color-accent)"
            strokeWidth={px}
            strokeDasharray={`${4 * px} ${3 * px}`}
            opacity={g.kind === 'border' ? 0.6 : undefined}
          />
        ),
      )}
      {gaps.map((g, i) => {
        const mid = (g.from + g.to) / 2;
        const label = `${formatMeters(g.lengthM, 2)} m`;
        return g.axis === 'x' ? (
          <g key={`gap-${i}`}>
            <line x1={g.from} x2={g.to} y1={g.at} y2={g.at} stroke="var(--color-accent)" strokeWidth={px} />
            <line x1={g.from} x2={g.from} y1={g.at - 4 * px} y2={g.at + 4 * px} stroke="var(--color-accent)" strokeWidth={px} />
            <line x1={g.to} x2={g.to} y1={g.at - 4 * px} y2={g.at + 4 * px} stroke="var(--color-accent)" strokeWidth={px} />
            <text
              x={mid}
              y={g.at - 4 * px}
              fontSize={11 * px}
              fill="var(--color-accent)"
              fontFamily="var(--font-mono)"
              stroke="var(--color-surface)"
              strokeWidth={3 * px}
              paintOrder="stroke"
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        ) : (
          <g key={`gap-${i}`}>
            <line x1={g.at} x2={g.at} y1={g.from} y2={g.to} stroke="var(--color-accent)" strokeWidth={px} />
            <line x1={g.at - 4 * px} x2={g.at + 4 * px} y1={g.from} y2={g.from} stroke="var(--color-accent)" strokeWidth={px} />
            <line x1={g.at - 4 * px} x2={g.at + 4 * px} y1={g.to} y2={g.to} stroke="var(--color-accent)" strokeWidth={px} />
            <text
              x={g.at + 4 * px}
              y={mid}
              fontSize={11 * px}
              fill="var(--color-accent)"
              fontFamily="var(--font-mono)"
              stroke="var(--color-surface)"
              strokeWidth={3 * px}
              paintOrder="stroke"
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        );
      })}
      {total && (
        <>
          <rect
            x={total.x}
            y={total.y}
            width={total.w}
            height={total.d}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={px}
            strokeDasharray={`${4 * px} ${3 * px}`}
            opacity={0.45}
          />
          <text
            x={total.x + total.w / 2}
            y={total.y + total.d + 14 * px}
            fontSize={11 * px}
            fill="var(--color-accent)"
            fontFamily="var(--font-mono)"
            stroke="var(--color-surface)"
            strokeWidth={3 * px}
            paintOrder="stroke"
            textAnchor="middle"
          >
            {`Gesamt ${formatMeters(total.w)} × ${formatMeters(total.d)} m`}
          </text>
        </>
      )}
    </g>
  );
}

interface DragOverlayProps {
  pieces: Piece2D[];
  selectedIds: string[];
  drag: DragState | null;
  /** Vorschau-Stücke beim Platzieren (Klick-Werkzeug oder Paletten-Ziehen); null ohne Cursor über dem Plan. */
  previewPieces: (FilledPiece & { valid?: boolean })[] | null;
  /** Smart-Guides-Daten der Live-Fläche; leer, solange keine Live-Fläche existiert (z.B. beim Gruppen-Ziehen). */
  guides: AlignmentGuide[];
  gaps: GapMeasure[];
  total: Rect | null;
  px: number;
}

/** Alles, was über den platzierten Stücken liegt: Geister beim Verschieben (Gruppe rot bei ungültiger
 *  Lage, Einzelstück mit Maßbeschriftung), Platzier-Vorschau mit Maßbeschriftung und Smart Guides. */
export function DragOverlay({ pieces, selectedIds, drag, previewPieces, guides, gaps, total, px }: DragOverlayProps) {
  return (
    <>
      {drag?.group &&
        drag.moved &&
        pieces
          .filter((p) => selectedIds.includes(p.id))
          .map((p) => (
            <PieceShape
              key={`ghost-${p.id}`}
              piece={{ ...p, x: p.x + drag.group!.dx, y: p.y + drag.group!.dy }}
              fill={drag.group!.valid ? 'var(--color-accent)' : 'var(--color-danger)'}
              fillOpacity={drag.group!.valid ? 0.35 : 0.2}
              stroke={drag.group!.valid ? 'var(--color-accent)' : 'var(--color-danger)'}
              strokeWidth={0.03}
              strokeDasharray={drag.group!.valid ? undefined : '0.08 0.06'}
              style={{ pointerEvents: 'none' }}
            />
          ))}
      {drag?.target &&
        (() => {
          const dragged = pieces.find((p) => p.id === drag.id);
          const w = dragged?.w ?? 0;
          const d = dragged?.d ?? 0;
          return (
            <>
              <PieceShape
                piece={{ x: drag.target.x, y: drag.target.y, w, d, corner: dragged?.corner, shape: dragged?.shape }}
                fill={drag.target.valid === false ? 'var(--color-danger)' : 'var(--color-accent)'}
                fillOpacity={drag.target.valid === false ? 0.2 : 0.35}
                stroke={drag.target.valid === false ? 'var(--color-danger)' : 'var(--color-accent)'}
                strokeWidth={0.03}
                strokeDasharray={drag.target.valid === false ? '0.08 0.06' : undefined}
                style={{ pointerEvents: 'none' }}
              />
              <DimensionLabel x={drag.target.x} y={drag.target.y} w={w} d={d} />
            </>
          );
        })()}

      {previewPieces?.map((p, idx) => (
        <PieceShape
          key={idx}
          piece={p}
          fill={p.valid === false ? 'var(--color-danger)' : 'var(--color-accent)'}
          fillOpacity={p.valid === false ? 0.2 : 0.35}
          stroke={p.valid === false ? 'var(--color-danger)' : 'var(--color-accent)'}
          strokeWidth={0.03}
          strokeDasharray={p.valid === false ? '0.08 0.06' : undefined}
          style={{ pointerEvents: 'none' }}
        />
      ))}
      {previewPieces?.length === 1 && (
        <DimensionLabel x={previewPieces[0].x} y={previewPieces[0].y} w={previewPieces[0].w} d={previewPieces[0].d} />
      )}

      <SmartGuidesLayer guides={guides} gaps={gaps} total={total} px={px} />
    </>
  );
}
