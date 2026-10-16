import { memo } from 'react';

/** Hintergrund des Plans: Schraffur-Muster für Stücke (normal und Sondermaß), Punktraster,
 *  Hauptrasterlinien, Vorderkante mit Beschriftung. Reine Zeichnung ohne Interaktion. */
export const CanvasGrid = memo(function CanvasGrid({
  uid,
  canvasWidthM,
  canvasDepthM,
  frontEdgeLabel,
  gridStepM,
  pad,
}: {
  uid: string;
  canvasWidthM: number;
  canvasDepthM: number;
  frontEdgeLabel: string;
  gridStepM: number;
  pad: number;
}) {
  return (
    <>
      <defs>
        <pattern id={`pce-hatch-${uid}`} width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
          <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch)" strokeWidth={0.02} opacity={0.32} />
        </pattern>
        <pattern id={`pce-hatch-warning-${uid}`} width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
          <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch-warning)" strokeWidth={0.022} opacity={0.42} />
        </pattern>
        <pattern id={`pce-dotgrid-${uid}`} width={gridStepM} height={gridStepM} patternUnits="userSpaceOnUse">
          <circle cx={gridStepM / 2} cy={gridStepM / 2} r={0.012} fill="var(--color-grid-line)" />
        </pattern>
      </defs>

      <rect
        x={-pad}
        y={-pad}
        width={canvasWidthM + pad * 2}
        height={canvasDepthM + pad * 2}
        fill={`url(#pce-dotgrid-${uid})`}
        pointerEvents="none"
        data-pce-bg="1"
      />
      {Array.from({ length: Math.floor(canvasWidthM) + 1 }, (_, i) => (
        <line key={`vmaj-${i}`} x1={i} y1={0} x2={i} y2={canvasDepthM} stroke="var(--color-grid-line-major)" strokeWidth={0.01} pointerEvents="none" />
      ))}
      {Array.from({ length: Math.floor(canvasDepthM) + 1 }, (_, i) => (
        <line key={`hmaj-${i}`} x1={0} y1={i} x2={canvasWidthM} y2={i} stroke="var(--color-grid-line-major)" strokeWidth={0.01} pointerEvents="none" />
      ))}

      <line x1={0} y1={0} x2={canvasWidthM} y2={0} stroke="var(--color-panel-stroke)" strokeWidth={0.04} />
      <text
        x={canvasWidthM / 2}
        y={-0.18}
        fontSize={0.22}
        textAnchor="middle"
        fill="var(--color-text-muted)"
        fontFamily="var(--font-display)"
      >
        {frontEdgeLabel}
      </text>
    </>
  );
});
