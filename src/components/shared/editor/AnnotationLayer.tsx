import { memo } from 'react';
import { measureLength, SYMBOL_LABELS, type PlanAnnotation } from '../../../domain/annotations';
import { formatMeters } from '../../../lib/format';

/** Farbe des Notausgang-Symbols (Grün, unabhängig vom Farbschema des Plans); gleich wie in RoomLayer. */
const EXIT_COLOR = '#2e7d32';
/** Maße eines Symbols in Metern (Breite, Höhe) und Eckenradius. */
const SYMBOL_W_M = 0.9;
const SYMBOL_H_M = 0.45;
const SYMBOL_RADIUS_M = 0.08;
/** Halbe Länge der Endstriche einer Messlinie in Metern. */
const TICK_HALF_M = 0.15;

/** Hintergrund-Halo hinter Text und Symbolen, damit sie auch über Stücken und Linien lesbar bleiben. */
const HALO = { stroke: 'var(--color-surface)', paintOrder: 'stroke' as const };

/** Eine Notiz im Plan. Alle Maße in Metern; px = Meter pro Bildschirm-Pixel (für Linienstärken und Schrift). */
function AnnotationShape({
  a,
  selected,
  px,
  interactive,
  onSelect,
}: {
  a: PlanAnnotation;
  selected: boolean;
  px: number;
  interactive: boolean;
  onSelect: (id: string) => void;
}) {
  const accent = 'var(--color-accent)';
  const ink = selected ? accent : 'var(--color-text)';
  const pointer = {
    pointerEvents: interactive ? ('all' as const) : ('none' as const),
    cursor: interactive ? 'pointer' : undefined,
    onPointerDown: interactive ? () => onSelect(a.id) : undefined,
    'data-pce-anno': interactive ? '' : undefined,
  };

  if (a.kind === 'text') {
    return (
      <text
        x={a.x}
        y={a.y}
        fontSize={12 * px}
        fill={ink}
        stroke={HALO.stroke}
        strokeWidth={3 * px}
        paintOrder={HALO.paintOrder}
        fontFamily="var(--font-mono)"
        {...pointer}
      >
        {a.text}
      </text>
    );
  }

  if (a.kind === 'symbol') {
    const frame = a.symbol === 'notausgang' ? EXIT_COLOR : selected ? accent : 'var(--color-text)';
    const label = a.symbol === 'notausgang' ? EXIT_COLOR : ink;
    return (
      <g {...pointer}>
        <rect
          x={a.x}
          y={a.y}
          width={SYMBOL_W_M}
          height={SYMBOL_H_M}
          rx={SYMBOL_RADIUS_M}
          fill="var(--color-surface)"
          stroke={frame}
          strokeWidth={2 * px}
        />
        {a.symbol === 'treppe' &&
          [1, 2, 3].map((i) => (
            <line
              key={i}
              x1={a.x + (SYMBOL_W_M * i) / 4}
              y1={a.y + 0.05}
              x2={a.x + (SYMBOL_W_M * i) / 4}
              y2={a.y + SYMBOL_H_M - 0.05}
              stroke={frame}
              strokeWidth={1.5 * px}
              pointerEvents="none"
            />
          ))}
        <text
          x={a.x + SYMBOL_W_M / 2}
          y={a.y + SYMBOL_H_M / 2}
          fontSize={0.15}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={label}
          stroke={HALO.stroke}
          strokeWidth={3 * px}
          paintOrder={HALO.paintOrder}
          fontFamily="var(--font-mono)"
          pointerEvents="none"
        >
          {SYMBOL_LABELS[a.symbol]}
        </text>
      </g>
    );
  }

  // Messlinie: Linie mit Endstrichen und Länge in Metern am Mittelpunkt.
  const len = measureLength(a);
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const raw = Math.hypot(dx, dy);
  // Senkrechte Einheitsvektor für die Endstriche (Länge 0 ist durch die Domäne ausgeschlossen).
  const nx = raw > 0 ? -dy / raw : 0;
  const ny = raw > 0 ? dx / raw : 0;
  const mx = (a.x1 + a.x2) / 2;
  const my = (a.y1 + a.y2) / 2;
  const labelText = `${formatMeters(len)} m`;
  // Trefferflächen: die 2-px-Linie allein ist (vor allem mit dem Finger) kaum zu treffen, und die
  // Beschriftung war gar nicht anklickbar. Unsichtbare breite Linie + Rechteck hinter dem Text.
  const labelW = (labelText.length * 8 + 12) * px;
  const labelH = 22 * px;
  return (
    <g {...pointer}>
      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={24 * px} strokeLinecap="round" />
      <rect x={mx - labelW / 2} y={my - 0.12 - labelH * 0.75} width={labelW} height={labelH} fill="transparent" />
      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={ink} strokeWidth={2 * px} pointerEvents="none" />
      <line
        x1={a.x1 + nx * TICK_HALF_M}
        y1={a.y1 + ny * TICK_HALF_M}
        x2={a.x1 - nx * TICK_HALF_M}
        y2={a.y1 - ny * TICK_HALF_M}
        stroke={ink}
        strokeWidth={2 * px}
        pointerEvents="none"
      />
      <line
        x1={a.x2 + nx * TICK_HALF_M}
        y1={a.y2 + ny * TICK_HALF_M}
        x2={a.x2 - nx * TICK_HALF_M}
        y2={a.y2 - ny * TICK_HALF_M}
        stroke={ink}
        strokeWidth={2 * px}
        pointerEvents="none"
      />
      <text
        x={mx}
        y={my - 0.12}
        fontSize={12 * px}
        textAnchor="middle"
        fill={ink}
        stroke={HALO.stroke}
        strokeWidth={3 * px}
        paintOrder={HALO.paintOrder}
        fontFamily="var(--font-mono)"
        pointerEvents="none"
      >
        {labelText}
      </text>
    </g>
  );
}

/**
 * Notizen, Symbole und Messlinien als Ebene über den Stücken. Ohne `interactive` (z. B. während eines
 * Werkzeugs oder Ziehens) ist die Ebene durchlässig, damit Stück-Interaktionen unverändert bleiben.
 */
export const AnnotationLayer = memo(function AnnotationLayer({
  annotations,
  selectedId,
  px,
  interactive,
  onSelect,
}: {
  annotations: PlanAnnotation[];
  selectedId: string | null;
  px: number;
  interactive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <g>
      {annotations.map((a) => (
        <AnnotationShape key={a.id} a={a} selected={a.id === selectedId} px={px} interactive={interactive} onSelect={onSelect} />
      ))}
    </g>
  );
});
