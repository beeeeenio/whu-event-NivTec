import { useId } from 'react';
import { boundingBoxOf } from '../../domain/customShape';
import type { LabeledFootPosition } from '../../domain/feet';
import { footColorForHeight } from '../../domain/footColorScale';
import { DimensionChains } from './DimensionChains';
import { quarterCirclePath, trianglePoints } from '../../domain/triangle';
import type { LayoutResult, RailingSide } from '../../domain/types';
import { formatMeters } from '../../lib/format';

interface Props {
  layout: LayoutResult;
  feet: LabeledFootPosition[];
  /** Bauhöhe dieser Ebene (cm) — bestimmt die Fußfarbe (einheitliche Höhen-Farbkodierung im ganzen Tool). */
  heightCm: number;
  railingSides?: RailingSide[];
  railingConfigurable?: boolean;
  onToggleRailingSide?: (side: RailingSide) => void;
  showLabels?: boolean;
  /** Erzwingt eine Mindestbreite der viewBox — z.B. damit zwei nebeneinander gezeigte Ebenen
   *  (Tresen: Unterbau + Thekenplatte) dieselbe Skala teilen, statt unabhängig zu skalieren. */
  minWidthM?: number;
  /** Zeigt Außen- und Segmentmaße (Maßketten) unter bzw. rechts neben dem Grundriss. */
  showDimensions?: boolean;
}

const RAILING_EDGES: Record<RailingSide, (w: number, d: number) => [number, number, number, number]> = {
  hinten: (w) => [0, 0, w, 0],
  vorne: (w, d) => [0, d, w, d],
  links: (_w, d) => [0, 0, 0, d],
  rechts: (w, d) => [w, 0, w, d],
};

const SIDE_LABELS: Record<RailingSide, string> = {
  hinten: '↑ hinten',
  vorne: '↓ vorne',
  links: '← links',
  rechts: 'rechts →',
};

export function FloorPlanSVG({
  layout,
  feet,
  heightCm,
  railingSides = [],
  railingConfigurable = false,
  onToggleRailingSide,
  showLabels = true,
  minWidthM,
  showDimensions = false,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { widthM, depthM, panels } = layout;
  const footColor = footColorForHeight(heightCm);
  // Mit Maßketten braucht der Rand Platz für zwei Maßreihen (je 0,35 m) plus Text.
  const pad = showDimensions ? 1.2 : 0.8;
  const effectiveWidthM = Math.max(widthM, minWidthM ?? 0);
  const viewBox = `${-pad} ${-pad} ${effectiveWidthM + pad * 2} ${depthM + pad * 2}`;
  // Beschriftung zeigt die tatsächlich belegte Fläche — widthM/depthM zählen ab dem Ursprung
  // auch einen Versatz auf der Zeichenfläche mit (z.B. eine verschobene Tresen-Ebene).
  const footprint = boundingBoxOf(panels);

  if (widthM <= 0 || depthM <= 0 || !footprint) return null;

  return (
    <div className="space-y-1.5">
      <svg viewBox={viewBox} className="w-full h-auto max-h-[440px]" role="img" aria-label="Grundrissplan">
      <defs>
        <pattern id={`fps-hatch-${uid}`} width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
          <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch)" strokeWidth={0.02} opacity={0.32} />
        </pattern>
        <pattern id={`fps-hatch-warning-${uid}`} width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
          <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch-warning)" strokeWidth={0.022} opacity={0.42} />
        </pattern>
        <pattern id={`fps-dotgrid-${uid}`} width={0.5} height={0.5} patternUnits="userSpaceOnUse">
          <circle cx={0.25} cy={0.25} r={0.012} fill="var(--color-grid-line)" />
        </pattern>
      </defs>
      <rect
        x={-pad}
        y={-pad}
        width={widthM + pad * 2}
        height={depthM + pad * 2}
        fill="var(--color-surface)"
      />
      <rect x={-pad} y={-pad} width={widthM + pad * 2} height={depthM + pad * 2} fill={`url(#fps-dotgrid-${uid})`} />
      {Array.from({ length: Math.floor(widthM) + 1 }, (_, i) => (
        <line key={`vmaj-${i}`} x1={i} y1={0} x2={i} y2={depthM} stroke="var(--color-grid-line-major)" strokeWidth={0.01} />
      ))}
      {Array.from({ length: Math.floor(depthM) + 1 }, (_, i) => (
        <line key={`hmaj-${i}`} x1={0} y1={i} x2={widthM} y2={i} stroke="var(--color-grid-line-major)" strokeWidth={0.01} />
      ))}
      {panels.map((p, i) => {
        const isTriangle = p.corner !== undefined;
        return (
          <g key={i}>
            {isTriangle && p.shape === 'viertelkreis' ? (
              <path
                d={quarterCirclePath(p, p.corner!)}
                fill={`url(#fps-hatch-${uid})`}
                stroke="var(--color-panel-stroke)"
                strokeWidth={0.03}
              />
            ) : isTriangle ? (
              <polygon
                points={trianglePoints(p, p.corner!)
                  .map((pt) => `${pt.x},${pt.y}`)
                  .join(' ')}
                fill={`url(#fps-hatch-${uid})`}
                stroke="var(--color-panel-stroke)"
                strokeWidth={0.03}
              />
            ) : (
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.d}
                fill={p.isSondermass ? `url(#fps-hatch-warning-${uid})` : `url(#fps-hatch-${uid})`}
                stroke="var(--color-panel-stroke)"
                strokeWidth={0.03}
              />
            )}
          </g>
        );
      })}
      {(Object.keys(RAILING_EDGES) as RailingSide[]).map((side) => {
        const [x1, y1, x2, y2] = RAILING_EDGES[side](widthM, depthM);
        const active = railingSides.includes(side);
        return (
          <line
            key={side}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={active ? 'var(--color-railing)' : 'var(--color-grid-line)'}
            strokeWidth={active ? 0.1 : 0.05}
            strokeLinecap="round"
            onClick={railingConfigurable ? () => onToggleRailingSide?.(side) : undefined}
            style={railingConfigurable ? { cursor: 'pointer' } : undefined}
          />
        );
      })}
      {feet.map((f, i) => {
        const shared = f.podeste.length > 1;
        return (
          <g key={i}>
            <circle cx={f.renderX} cy={f.renderY} r={0.07} fill={footColor}>
              <title>
                Podest {f.ownerPodest}, Fußhöhe {heightCm} cm
                {shared ? ` (Fuß trägt außerdem Podest ${f.podeste.filter((n) => n !== f.ownerPodest).join(', ')})` : ''}
              </title>
            </circle>
            {showLabels && (
              <g>
                <rect x={f.renderX - 0.16} y={f.renderY - 0.34} width={0.32} height={0.22} rx={0.05} fill={footColor} />
                <text
                  x={f.renderX}
                  y={f.renderY - 0.18}
                  fontSize={0.16}
                  textAnchor="middle"
                  fill="var(--color-accent-contrast)"
                  fontWeight={700}
                >
                  {f.ownerPodest}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {/* Eigener, letzter Rendering-Durchgang für die Podest-Nummern — bewusst NACH den Füßen
          (die undurchsichtige Schilder haben), sonst können enge Stücke (schmale Sondermaß-
          Streifen, Keil-Spitzen) ihre eigene Nummer unter einem benachbarten Fuß-Schild verlieren.
          Ein heller Halo (paintOrder="stroke") hält die Zahl zusätzlich lesbar über der
          Schraffur, egal was darunterliegt. */}
      {showLabels &&
        panels.map((p, i) => {
          const isTriangle = p.corner !== undefined;
          const labelCenter = isTriangle
            ? (() => {
                const pts = trianglePoints(p, p.corner!);
                return { x: (pts[0].x + pts[1].x + pts[2].x) / 3, y: (pts[0].y + pts[1].y + pts[2].y) / 3 };
              })()
            : { x: p.x + p.w / 2, y: p.y + p.d / 2 };
          return (
            <text
              key={i}
              x={labelCenter.x}
              y={labelCenter.y + 0.09}
              fontSize={Math.min(p.w, p.d) * 0.4}
              textAnchor="middle"
              fill="var(--color-text)"
              fontWeight={700}
              opacity={0.7}
              stroke="var(--color-surface)"
              strokeWidth={0.05}
              paintOrder="stroke"
            >
              {i + 1}
            </text>
          );
        })}
      <text
        x={footprint.x + footprint.widthM / 2}
        y={-pad + 0.3}
        fontSize={0.28}
        textAnchor="middle"
        fill="var(--color-text-muted)"
        fontFamily="var(--font-mono)"
      >
        {formatMeters(footprint.widthM)} × {formatMeters(footprint.depthM)} m
      </text>
      {railingConfigurable &&
        (Object.keys(SIDE_LABELS) as RailingSide[]).map((side) => {
          const positions: Record<RailingSide, [number, number]> = {
            hinten: [widthM / 2, -pad + 0.55],
            vorne: [widthM / 2, depthM + pad - 0.15],
            links: [-pad + 0.1, depthM / 2],
            rechts: [widthM + pad - 0.1, depthM / 2],
          };
          const [x, y] = positions[side];
          return (
            <text
              key={side}
              x={x}
              y={y}
              fontSize={0.22}
              textAnchor="middle"
              fill="var(--color-text-muted)"
            >
              {SIDE_LABELS[side]}
            </text>
          );
        })}
      {showDimensions && <DimensionChains rects={panels} />}
      </svg>
      {showLabels && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Graue Zahl in der Platte = Podest-Nummer. Farbiges Schild (Farbe = Fußhöhe {heightCm} cm, siehe Legende) =
          Fuß, sichtbar in die Platte gezeichnet, an der er festgemacht ist (bei geteilten Ecken: die Platte mit der
          niedrigsten Nummer — auf den Punkt tippen/hovern zeigt, welche weiteren Podeste sich diesen Fuß teilen).
        </p>
      )}
    </div>
  );
}
