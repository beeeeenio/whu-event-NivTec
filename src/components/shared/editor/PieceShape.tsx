import { quarterCirclePath, trianglePoints } from '../../../domain/triangle';
import type { TriangleCorner } from '../../../domain/types';
import { formatMeters } from '../../../lib/format';

export interface ShapeGeometry {
  x: number;
  y: number;
  w: number;
  d: number;
  corner?: TriangleCorner;
  shape?: string;
}

/** Rendert ein Stück (egal ob platziert, Geist beim Ziehen oder Vorschau) als `<rect>` oder,
 *  bei einem Dreieckpodest, als `<polygon>` mit den 3 echten Eckpunkten — eine Stelle statt
 *  vierfach dupliziert (platzierte Stücke, Verschiebe-Ziel-Geist, Platzier-/Zieh-Vorschau). */
export function PieceShape({
  piece,
  fill,
  fillOpacity,
  stroke,
  strokeWidth,
  strokeOpacity,
  strokeDasharray,
  pointerEvents,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onPointerEnter,
  onPointerLeave,
  dataPiece,
  children,
}: {
  piece: ShapeGeometry;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity?: number;
  strokeDasharray?: string;
  pointerEvents?: 'all' | 'none';
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<SVGElement>) => void;
  onLostPointerCapture?: (e: React.PointerEvent<SVGElement>) => void;
  /** Hover durchreichen (Hervorheben unter der Maus im Editor). */
  onPointerEnter?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerLeave?: (e: React.PointerEvent<SVGElement>) => void;
  /** Markiert ein platziertes Stück im DOM (data-pce-piece), damit Touch-Gesten am Plan es erkennen. */
  dataPiece?: boolean;
  children?: React.ReactNode;
}) {
  const shared = {
    'data-pce-piece': dataPiece ? '1' : undefined,
    fill,
    fillOpacity,
    stroke,
    strokeWidth,
    strokeOpacity,
    strokeDasharray,
    pointerEvents,
    style,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onPointerEnter,
    onPointerLeave,
  };
  if (piece.corner === undefined) {
    return (
      <rect x={piece.x} y={piece.y} width={piece.w} height={piece.d} {...shared}>
        {children}
      </rect>
    );
  }
  if (piece.shape === 'viertelkreis') {
    return (
      <path d={quarterCirclePath(piece, piece.corner)} {...shared}>
        {children}
      </path>
    );
  }
  const points = trianglePoints(piece, piece.corner)
    .map((pt) => `${pt.x},${pt.y}`)
    .join(' ');
  return (
    <polygon points={points} {...shared}>
      {children}
    </polygon>
  );
}

/** Maß-Beschriftung wie auf einem echten Aufmaßblatt — folgt einem einzelnen Stück
 *  beim Ziehen/Platzieren-Vorschau. */
export function DimensionLabel({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  return (
    <text
      x={x + w / 2}
      y={y - 0.12}
      fontSize={0.16}
      textAnchor="middle"
      fill="var(--color-accent)"
      fontFamily="var(--font-mono)"
      style={{ pointerEvents: 'none' }}
    >
      {formatMeters(w, 2)}×{formatMeters(d, 2)} m
    </text>
  );
}
