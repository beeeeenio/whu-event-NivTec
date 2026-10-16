import type { TriangleCorner } from './types';

/** Händigkeit eines 2×1-Dreieckpodests (welcher der beiden rechten Winkel-Katheten die lange ist). */
export type TriangleHand = 'links' | 'rechts';

/**
 * Eigene, kleine Datei statt Anhängsel an customShape.ts: feet.ts/bracing.ts brauchen diese
 * Geometrie auch, dürfen aber nicht aus customShape.ts importieren (customShape.ts → layout.ts
 * → feet.ts bereits — ein Rückimport wäre ein Zirkelimport). Hängt nur von types.ts ab.
 */

const CORNER_KEYS = ['tl', 'tr', 'bl', 'br'] as const;

/** Für jede rechtwinklige Ecke: die 3 Ecken der Bounding-Box, die zum echten Dreieck gehören
 *  (die Ecke mit dem rechten Winkel selbst + ihre beiden Nachbarn entlang der Kanten) — die
 *  4. (diagonal gegenüberliegende) Ecke ist die "Phantom"-Ecke ohne echtes Material. */
const REAL_CORNERS: Record<TriangleCorner, readonly TriangleCorner[]> = {
  tl: ['tl', 'tr', 'bl'],
  tr: ['tl', 'tr', 'br'],
  bl: ['tl', 'bl', 'br'],
  br: ['tr', 'bl', 'br'],
};

/** Die eine Ecke der Bounding-Box ohne echtes Material — gegenüber dem rechten Winkel. Nie
 *  einen Fuß dort platzieren (es sei denn, ein NACHBAR-Stück hat dort selbst eine echte Ecke). */
export function phantomCorner(corner: TriangleCorner): TriangleCorner {
  const real = REAL_CORNERS[corner];
  return CORNER_KEYS.find((c) => !real.includes(c))!;
}

/** Die 3 echten Eckpunkte in Metern (Domain-Koordinaten) — für `<polygon>` und 3D-Extrusion. */
export function trianglePoints(
  piece: { x: number; y: number; w: number; d: number },
  corner: TriangleCorner,
): Array<{ x: number; y: number }> {
  const points: Record<TriangleCorner, { x: number; y: number }> = {
    tl: { x: piece.x, y: piece.y },
    tr: { x: piece.x + piece.w, y: piece.y },
    bl: { x: piece.x, y: piece.y + piece.d },
    br: { x: piece.x + piece.w, y: piece.y + piece.d },
  };
  return REAL_CORNERS[corner].map((c) => points[c]);
}

// Echte 90°-Drehung der ganzen Bounding-Box im Uhrzeigersinn (Bildschirm-/SVG-Konvention,
// y nach unten): tl→tr→br→bl→tl. NICHT dieselbe Reihenfolge wie REAL_CORNERS (das ist nur
// "welche 3 Ecken gehören zu dieser Ausrichtung", keine Rotationsreihenfolge).
const ROTATION_ORDER: readonly TriangleCorner[] = ['tl', 'tr', 'br', 'bl'];

/** Nächste Ecke im 4-Zustands-Dreh-Zyklus (ersetzt den 2-Zustands-w/d-Tausch für Rechtecke). */
export function nextTriangleCorner(corner: TriangleCorner): TriangleCorner {
  const i = ROTATION_ORDER.indexOf(corner);
  return ROTATION_ORDER[(i + 1) % ROTATION_ORDER.length];
}

/** Spiegelt an der waagerechten Achse (oben/unten tauschen, links/rechts bleibt) — z.B. wenn
 *  die Bounding-Box einer Ecke vertikal gespiegelt wird (nach oben statt nach unten gezogen). */
export function mirrorTriangleCornerVertical(corner: TriangleCorner): TriangleCorner {
  const map: Record<TriangleCorner, TriangleCorner> = { tl: 'bl', bl: 'tl', tr: 'br', br: 'tr' };
  return map[corner];
}

/** Spiegelt an der Hauptdiagonale (tl/br bleiben, tr/bl tauschen) — entspricht einer x/y-
 *  Transposition der Bounding-Box (z.B. wenn Breite und Tiefe vertauscht werden). */
export function mirrorTriangleCornerDiagonal(corner: TriangleCorner): TriangleCorner {
  const map: Record<TriangleCorner, TriangleCorner> = { tl: 'tl', br: 'br', tr: 'bl', bl: 'tr' };
  return map[corner];
}

/** SVG-Pfad (Domain-Meter) eines Viertelkreises: Mittelpunkt an der angegebenen Ecke der
 *  Bounding-Box, Radius = piece.w (angenommen piece.w === piece.d). Der Bogen verläuft nach
 *  außen (weg vom Mittelpunkt), nicht nach innen. */
export function quarterCirclePath(
  piece: { x: number; y: number; w: number; d: number },
  corner: TriangleCorner,
): string {
  // Mittelpunkt: die Ecke mit dem rechten Winkel
  const centerPoints: Record<TriangleCorner, { x: number; y: number }> = {
    tl: { x: piece.x, y: piece.y },
    tr: { x: piece.x + piece.w, y: piece.y },
    bl: { x: piece.x, y: piece.y + piece.d },
    br: { x: piece.x + piece.w, y: piece.y + piece.d },
  };
  const center = centerPoints[corner];

  // Die 3 echten Eckpunkte (außer der Phantom-Ecke) — ohne der Mitte
  const points = trianglePoints(piece, corner);
  // points enthält [punkt1, punkt2, punkt3], von denen genau zwei nicht der Mittelpunkt sind
  const ends = points.filter((p) => p.x !== center.x || p.y !== center.y);
  const end1 = ends[0];
  const end2 = ends[1];

  // Radius für den Kreisbogen (w === d für Viertelkreis)
  const radius = piece.w;

  // SVG-Bogen um den Mittelpunkt (nach außen gewölbt): Die Drehrichtung von end1 nach end2 hängt
  // von der Ecke ab — ein festes sweep-flag würde bei 'tr'/'br' den Bogen um die Phantom-Ecke
  // schlagen (nach innen gewölbt). Kreuzprodukt > 0 = im Uhrzeigersinn (y nach unten) = sweep 1.
  const cross = (end1.x - center.x) * (end2.y - center.y) - (end1.y - center.y) * (end2.x - center.x);
  const sweep = cross > 0 ? 1 : 0;
  return `M ${center.x} ${center.y} L ${end1.x} ${end1.y} A ${radius} ${radius} 0 0 ${sweep} ${end2.x} ${end2.y} Z`;
}

/**
 * Bestimmt die Händigkeit eines 2×1-Dreieckpodests.
 * Konvention (nicht aus dem Katalog-Foto ableitbar, muss vom Nutzer gegen den echten Katalog
 * geprüft werden): 'rechts' = rechter Winkel oben-links, lange Kathete waagerecht oben
 * (corner 'tl', w=2, d=1). Drehen erhält die Händigkeit, Spiegeln tauscht sie.
 */
export function triangleHand(corner: TriangleCorner, w: number, d: number): TriangleHand {
  // Prüfe, ob die Diagonale (tl/br) mit der Breite übereinstimmt
  const onDiagonal = corner === 'tl' || corner === 'br';
  const isWide = w > d;
  // 'rechts' wenn: Diagonale == Breite > Tiefe (oder Breite < Tiefe bei tr/bl)
  return onDiagonal === isWide ? 'rechts' : 'links';
}
