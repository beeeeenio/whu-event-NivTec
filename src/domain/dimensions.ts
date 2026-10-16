/** Ein Maßabschnitt zwischen zwei Kanten einer Achse (Meter, Ursprung wie im Plan). */
export interface DimSegment {
  from: number;
  to: number;
  lengthM: number;
}

/** Maßkette einer Achse: Außenmaß (Bounding-Box) und Segmentmaße zwischen allen Stückkanten. */
export interface DimensionChain {
  axis: 'x' | 'y';
  outer: DimSegment;
  segments: DimSegment[];
}

/** Zwei Kanten gelten als identisch, wenn sie (nach Rundung) weniger als 1 mm auseinander liegen. */
const DUPLICATE_EPS_M = 1e-3;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Sortierte, gerundete und von Dubletten befreite Kantenliste einer Achse. */
function edgesOf(values: number[]): number[] {
  const sorted = values.map(round3).sort((a, b) => a - b);
  const unique: number[] = [];
  for (const v of sorted) {
    if (unique.length === 0 || Math.abs(v - unique[unique.length - 1]) >= DUPLICATE_EPS_M) {
      unique.push(v);
    }
  }
  return unique;
}

function chainFor(axis: 'x' | 'y', edges: number[]): DimensionChain {
  const first = edges[0];
  const last = edges[edges.length - 1];
  const outer: DimSegment = { from: first, to: last, lengthM: round3(last - first) };

  // Bei nur zwei Kanten ist das einzige Segment identisch mit dem Außenmaß.
  if (edges.length <= 2) {
    return { axis, outer, segments: [{ ...outer }] };
  }

  const segments: DimSegment[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i];
    const to = edges[i + 1];
    segments.push({ from, to, lengthM: round3(to - from) });
  }
  return { axis, outer, segments };
}

/**
 * Außenmaß (Bounding-Box) und Segmentmaße zwischen allen vorkommenden Stückkanten je Achse.
 * Eingabe sind Rechtecke (bei Dreiecken ihre Bounding-Box). Leere Eingabe → null.
 */
export function dimensionChains(
  rects: readonly { x: number; y: number; w: number; d: number }[],
): { x: DimensionChain; y: DimensionChain } | null {
  if (rects.length === 0) return null;

  const xEdges = edgesOf(rects.flatMap((r) => [r.x, r.x + r.w]));
  const yEdges = edgesOf(rects.flatMap((r) => [r.y, r.y + r.d]));

  return {
    x: chainFor('x', xEdges),
    y: chainFor('y', yEdges),
  };
}
