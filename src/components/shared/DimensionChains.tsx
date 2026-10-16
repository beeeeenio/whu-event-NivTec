import { dimensionChains, type DimSegment } from '../../domain/dimensions';
import { formatMeters } from '../../lib/format';

interface Props {
  rects: readonly { x: number; y: number; w: number; d: number }[];
  /** Abstand der ersten Maßlinie zur Fläche (m); das Außenmaß liegt bei 2× diesem Abstand. */
  offsetM?: number;
  /** Schrifthöhe der Maßzahlen (m) — skaliert auch Schrägstriche und Halo. */
  fontSizeM?: number;
  strokeWidthM?: number;
  /** Segmentmaße zusätzlich zum Außenmaß zeigen. */
  showSegments?: boolean;
}

/** Ein Maßabschnitt unter 0,3 m bekommt eine kleinere Schrift, damit die Zahl Platz hat. */
const SHORT_SEGMENT_M = 0.3;
const SHORT_SEGMENT_FONT_FACTOR = 0.7;

/** Maßzahl sitzt auf der Maßlinie; der Halo unterbricht die Linie hinter der Zahl. */
const LABEL_BASELINE_FACTOR = 0.33;

/** Überstand der Hilfslinien über die Maßlinie hinaus (m). */
const HAIRLINE_OVERSHOOT_M = 0.05;

/** 45°-Schrägstrich mit Mittelpunkt (cx, cy), Gesamtlänge tickLen (m). */
function tickPath(cx: number, cy: number, tickLen: number): string {
  const d = tickLen / (2 * Math.SQRT2);
  return `M ${cx - d} ${cy + d} L ${cx + d} ${cy - d}`;
}

/**
 * Maßketten (Segment- und Außenmaße in Metern) unter bzw. rechts neben dem Grundriss.
 * Maßstabsunabhängig: alle Größen sind in Metern, die SVG-Koordinaten des Plans.
 */
export function DimensionChains({
  rects,
  offsetM = 0.35,
  fontSizeM = 0.16,
  strokeWidthM = 0.012,
  showSegments = true,
}: Props) {
  const chains = dimensionChains(rects);
  if (!chains) return null;

  const tickLen = fontSizeM / 2;
  const hairline = strokeWidthM * 0.6;
  const maxX = chains.x.outer.to;
  const maxY = chains.y.outer.to;

  // Reihe 1 = Segmente, Reihe 2 = Außenmaß; x-Kette unter der Fläche, y-Kette rechts davon.
  const xRow1 = maxY + offsetM;
  const xRow2 = maxY + 2 * offsetM;
  const yCol1 = maxX + offsetM;
  const yCol2 = maxX + 2 * offsetM;

  // Segmentreihe nur, wenn sie sich vom Außenmaß unterscheidet (sonst doppelte Beschriftung).
  const showXSegments = showSegments && chains.x.segments.length > 1;
  const showYSegments = showSegments && chains.y.segments.length > 1;

  const segmentFont = (s: DimSegment) =>
    s.lengthM < SHORT_SEGMENT_M ? fontSizeM * SHORT_SEGMENT_FONT_FACTOR : fontSizeM;

  const textProps = {
    fill: 'var(--color-text-muted)',
    stroke: 'var(--color-surface)',
    paintOrder: 'stroke' as const,
    fontFamily: 'var(--font-mono)',
  };
  const lineProps = { stroke: 'var(--color-text-muted)', strokeWidth: strokeWidthM };

  /** Horizontale Maßlinie (x-Kette) bei Höhe y zwischen seg.from und seg.to. */
  const renderHorizontal = (seg: DimSegment, y: number, key: string) => {
    const font = segmentFont(seg);
    return (
      <g key={key}>
        <line x1={seg.from} y1={y} x2={seg.to} y2={y} {...lineProps} />
        <path d={tickPath(seg.from, y, tickLen)} {...lineProps} />
        <path d={tickPath(seg.to, y, tickLen)} {...lineProps} />
        <text
          x={(seg.from + seg.to) / 2}
          y={y + font * LABEL_BASELINE_FACTOR}
          fontSize={font}
          textAnchor="middle"
          strokeWidth={font * 0.3}
          {...textProps}
        >
          {formatMeters(seg.lengthM, 2)}
        </text>
      </g>
    );
  };

  /** Vertikale Maßlinie (y-Kette) bei x zwischen seg.from und seg.to; Text um -90° gedreht. */
  const renderVertical = (seg: DimSegment, x: number, key: string) => {
    const font = segmentFont(seg);
    const mid = (seg.from + seg.to) / 2;
    return (
      <g key={key}>
        <line x1={x} y1={seg.from} x2={x} y2={seg.to} {...lineProps} />
        <path d={tickPath(x, seg.from, tickLen)} {...lineProps} />
        <path d={tickPath(x, seg.to, tickLen)} {...lineProps} />
        <text
          x={x}
          y={mid + font * LABEL_BASELINE_FACTOR}
          fontSize={font}
          textAnchor="middle"
          strokeWidth={font * 0.3}
          transform={`rotate(-90 ${x} ${mid})`}
          {...textProps}
        >
          {formatMeters(seg.lengthM, 2)}
        </text>
      </g>
    );
  };

  return (
    <g pointerEvents="none">
      {/* Hilfslinien x-Kette: von der Unterkante der Fläche nach unten (Segmentkanten bis Reihe 1) */}
      {showXSegments &&
        chains.x.segments.flatMap((s, i) =>
          [s.from, s.to].map((x, j) => (
            <line
              key={`hx-s-${i}-${j}`}
              x1={x}
              y1={maxY}
              x2={x}
              y2={xRow1 + HAIRLINE_OVERSHOOT_M}
              stroke="var(--color-text-muted)"
              strokeWidth={hairline}
              opacity={0.6}
            />
          )),
        )}
      {[chains.x.outer.from, chains.x.outer.to].map((x, j) => (
        <line
          key={`hx-o-${j}`}
          x1={x}
          y1={maxY}
          x2={x}
          y2={xRow2 + HAIRLINE_OVERSHOOT_M}
          stroke="var(--color-text-muted)"
          strokeWidth={hairline}
          opacity={0.6}
        />
      ))}
      {/* Hilfslinien y-Kette: von der rechten Kante der Fläche nach rechts */}
      {showYSegments &&
        chains.y.segments.flatMap((s, i) =>
          [s.from, s.to].map((y, j) => (
            <line
              key={`hy-s-${i}-${j}`}
              x1={maxX}
              y1={y}
              x2={yCol1 + HAIRLINE_OVERSHOOT_M}
              y2={y}
              stroke="var(--color-text-muted)"
              strokeWidth={hairline}
              opacity={0.6}
            />
          )),
        )}
      {[chains.y.outer.from, chains.y.outer.to].map((y, j) => (
        <line
          key={`hy-o-${j}`}
          x1={maxX}
          y1={y}
          x2={yCol2 + HAIRLINE_OVERSHOOT_M}
          y2={y}
          stroke="var(--color-text-muted)"
          strokeWidth={hairline}
          opacity={0.6}
        />
      ))}
      {/* x-Kette: Segmente (Reihe 1) und Außenmaß (Reihe 2) */}
      {showXSegments && chains.x.segments.map((s, i) => renderHorizontal(s, xRow1, `sx-${i}`))}
      {renderHorizontal(chains.x.outer, xRow2, 'ox')}
      {/* y-Kette: Segmente (Spalte 1) und Außenmaß (Spalte 2) */}
      {showYSegments && chains.y.segments.map((s, i) => renderVertical(s, yCol1, `sy-${i}`))}
      {renderVertical(chains.y.outer, yCol2, 'oy')}
    </g>
  );
}
