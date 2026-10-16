/**
 * Reine Geometrie für die Smart Guides im Editor: Ausrichtungslinien (Kante/Mitte/Rand) und
 * Abstandsmaße zu den nächsten Nachbarn. Bewusst ohne React und ohne Editor-Zustand — der
 * Editor entscheidet nur, was davon gezeichnet wird. Koordinaten in Metern, Ursprung oben links.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** axis 'x' = senkrechte Linie bei x=pos (from/to = y-Ausdehnung); axis 'y' = waagerechte Linie bei y=pos. */
export interface AlignmentGuide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  kind: 'edge' | 'center' | 'border';
}

/** Abstandsmaß: axis 'x' = waagerechte Strecke von x=from bis x=to auf Höhe y=at. */
export interface GapMeasure {
  axis: 'x' | 'y';
  from: number;
  to: number;
  at: number;
  lengthM: number;
  toBorder: boolean;
}

/** Toleranz für "gleiche" Koordinaten bei Nachbarschafts- und Randprüfungen. */
const GUIDE_EPS = 1e-3;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Anfang, Länge sowie Anfang und Länge auf der Querachse eines Rechtecks für die gegebene Achse. */
function dimsOn(r: Rect, axis: 'x' | 'y') {
  return axis === 'x'
    ? { start: r.x, size: r.w, cross: r.y, crossSize: r.d }
    : { start: r.y, size: r.d, cross: r.x, crossSize: r.w };
}

/** Kandidaten-Linien eines Rechtecks entlang einer Achse: Anfangskante, Mitte, Endkante. */
function candidatesOn(r: Rect, axis: 'x' | 'y'): { v: number; kind: 'edge' | 'center' }[] {
  const { start, size } = dimsOn(r, axis);
  return [
    { v: start, kind: 'edge' },
    { v: start + size / 2, kind: 'center' },
    { v: start + size, kind: 'edge' },
  ];
}

/**
 * Ausrichtungslinien des bewegten Rechtecks gegenüber allen anderen: Kante passt auf Kante,
 * Mitte auf Mitte (gemischte Paare zählen nicht). Dazu eine Randlinie, wenn das bewegte Stück
 * an x=0 bzw. y=0 anliegt (y=0 ist die im Editor beschriftete Vorderkante). Gleiche Linien werden
 * zu einem Eintrag zusammengeführt.
 */
export function alignmentGuides(moving: Rect, others: readonly Rect[], eps = GUIDE_EPS): AlignmentGuide[] {
  const found = new Map<string, AlignmentGuide>();
  const add = (axis: 'x' | 'y', pos: number, kind: AlignmentGuide['kind'], from: number, to: number) => {
    const p = round3(pos);
    const key = `${axis}|${p}|${kind}`;
    const f = round3(from);
    const t = round3(to);
    const prev = found.get(key);
    if (prev) {
      prev.from = Math.min(prev.from, f);
      prev.to = Math.max(prev.to, t);
    } else {
      found.set(key, { axis, pos: p, kind, from: f, to: t });
    }
  };

  for (const axis of ['x', 'y'] as const) {
    const m = dimsOn(moving, axis);
    const mc = candidatesOn(moving, axis);
    for (const o of others) {
      const od = dimsOn(o, axis);
      const oc = candidatesOn(o, axis);
      // Gemeinsame Ausdehnung beider Rechtecke auf der Querachse
      const from = Math.min(m.cross, od.cross);
      const to = Math.max(m.cross + m.crossSize, od.cross + od.crossSize);
      for (const a of mc) {
        for (const b of oc) {
          if (a.kind !== b.kind) continue;
          if (Math.abs(a.v - b.v) >= eps) continue;
          add(axis, b.v, a.kind, from, to);
        }
      }
    }
    if (Math.abs(m.start) < eps) {
      add(axis, 0, 'border', 0, m.cross + m.crossSize);
    }
  }

  return [...found.values()];
}

/**
 * Abstandsmaße zu den nächsten Nachbarn in alle vier Richtungen. Nachbar ist, wer vollständig
 * auf dieser Seite liegt und sich auf der Querachse echt überlappt; gemessen wird die Lücke von
 * Kante zu Kante. Aufgenommen wird nur eine Lücke über eps und höchstens maxM. Gibt es links
 * oder oben keinen Nachbarn und liegt das Stück vom Rand entfernt, kommt ein Randmaß zu
 * x=0 bzw. y=0 dazu. Rechts und unten gibt es kein Randmaß.
 */
export function nearestGaps(moving: Rect, others: readonly Rect[], maxM = 10): GapMeasure[] {
  const eps = GUIDE_EPS;
  const out: GapMeasure[] = [];
  const mRight = moving.x + moving.w;
  const mBottom = moving.y + moving.d;
  const overlapsY = (o: Rect) => o.y < mBottom - eps && moving.y < o.y + o.d - eps;
  const overlapsX = (o: Rect) => o.x < mRight - eps && moving.x < o.x + o.w - eps;
  const midOverlapY = (o: Rect) => (Math.max(o.y, moving.y) + Math.min(o.y + o.d, mBottom)) / 2;
  const midOverlapX = (o: Rect) => (Math.max(o.x, moving.x) + Math.min(o.x + o.w, mRight)) / 2;

  // Links: nächster Nachbar mit größtem rechten Rand, der auf der linken Seite liegt
  const left = others.filter((o) => o.x + o.w <= moving.x + eps && overlapsY(o));
  if (left.length > 0) {
    const n = left.reduce((best, o) => (o.x + o.w > best.x + best.w ? o : best));
    const gap = moving.x - (n.x + n.w);
    if (gap > eps && gap <= maxM) {
      out.push({ axis: 'x', from: round3(n.x + n.w), to: round3(moving.x), at: round3(midOverlapY(n)), lengthM: round3(gap), toBorder: false });
    }
  } else if (moving.x > eps) {
    out.push({ axis: 'x', from: 0, to: round3(moving.x), at: round3(moving.y + moving.d / 2), lengthM: round3(moving.x), toBorder: true });
  }

  // Rechts: nächster Nachbar mit kleinstem linken Rand, der auf der rechten Seite liegt
  const right = others.filter((o) => o.x >= mRight - eps && overlapsY(o));
  if (right.length > 0) {
    const n = right.reduce((best, o) => (o.x < best.x ? o : best));
    const gap = n.x - mRight;
    if (gap > eps && gap <= maxM) {
      out.push({ axis: 'x', from: round3(mRight), to: round3(n.x), at: round3(midOverlapY(n)), lengthM: round3(gap), toBorder: false });
    }
  }

  // Oben: nächster Nachbar mit größtem unteren Rand, der oberhalb liegt
  const top = others.filter((o) => o.y + o.d <= moving.y + eps && overlapsX(o));
  if (top.length > 0) {
    const n = top.reduce((best, o) => (o.y + o.d > best.y + best.d ? o : best));
    const gap = moving.y - (n.y + n.d);
    if (gap > eps && gap <= maxM) {
      out.push({ axis: 'y', from: round3(n.y + n.d), to: round3(moving.y), at: round3(midOverlapX(n)), lengthM: round3(gap), toBorder: false });
    }
  } else if (moving.y > eps) {
    out.push({ axis: 'y', from: 0, to: round3(moving.y), at: round3(moving.x + moving.w / 2), lengthM: round3(moving.y), toBorder: true });
  }

  // Unten: nächster Nachbar mit kleinstem oberen Rand, der unterhalb liegt
  const bottom = others.filter((o) => o.y >= mBottom - eps && overlapsX(o));
  if (bottom.length > 0) {
    const n = bottom.reduce((best, o) => (o.y < best.y ? o : best));
    const gap = n.y - mBottom;
    if (gap > eps && gap <= maxM) {
      out.push({ axis: 'y', from: round3(mBottom), to: round3(n.y), at: round3(midOverlapX(n)), lengthM: round3(gap), toBorder: false });
    }
  }

  return out;
}

/** Hülle aller Rechtecke als {x,y,w,d}; null bei leerem Array. */
export function unionBounds(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.d));
  return { x: round3(minX), y: round3(minY), w: round3(maxX - minX), d: round3(maxY - minY) };
}
