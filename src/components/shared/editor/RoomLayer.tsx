import { memo } from 'react';
import { OBSTACLE_LABELS, type RoomObstacle, type RoomPlan } from '../../../domain/room';
import { quarterCirclePath } from '../../../domain/triangle';

/** Farbe der Notausgang-Freifläche (Grün, unabhängig vom Farbschema des Plans). */
const EXIT_COLOR = '#2e7d32';
const MUTED = 'var(--color-text-muted)';

/** Ein Hindernis: Säule (gefüllt), Tür (Schwenkbereich mit Bogen) oder Notausgang (grüne Freifläche). */
function ObstacleShape({ o, px }: { o: RoomObstacle; px: number }) {
  const dash = `${4 * px} ${3 * px}`;
  if (o.kind === 'saeule') {
    return <rect x={o.x} y={o.y} width={o.w} height={o.d} fill={MUTED} fillOpacity={0.35} pointerEvents="none" />;
  }
  if (o.kind === 'tuer') {
    return (
      <g pointerEvents="none">
        <rect x={o.x} y={o.y} width={o.w} height={o.d} fill="none" stroke={MUTED} strokeWidth={px} strokeDasharray={dash} pointerEvents="none" />
        <path d={quarterCirclePath(o, 'tl')} fill="none" stroke={MUTED} strokeWidth={px} pointerEvents="none" />
      </g>
    );
  }
  return (
    <rect
      x={o.x}
      y={o.y}
      width={o.w}
      height={o.d}
      fill={EXIT_COLOR}
      fillOpacity={0.12}
      stroke={EXIT_COLOR}
      strokeWidth={px}
      strokeDasharray={dash}
      pointerEvents="none"
    />
  );
}

/** Raumkontur mit Hindernissen (Säulen, Türen, Notausgänge) als Zeichnung unter den Stücken. Reine Anzeige ohne Interaktion. */
export const RoomLayer = memo(function RoomLayer({ room, px }: { room: RoomPlan; px: number }) {
  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={room.widthM} height={room.depthM} fill="none" stroke={MUTED} strokeWidth={2 * px} pointerEvents="none" />
      {room.obstacles.map((o) => (
        <g key={o.id} pointerEvents="none">
          <ObstacleShape o={o} px={px} />
          <text
            x={o.x + o.w / 2}
            y={o.y + o.d / 2}
            fontSize={10 * px}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={o.kind === 'notausgang' ? EXIT_COLOR : MUTED}
            fontFamily="var(--font-mono)"
            pointerEvents="none"
          >
            {o.label ?? OBSTACLE_LABELS[o.kind]}
          </text>
        </g>
      ))}
    </g>
  );
});
