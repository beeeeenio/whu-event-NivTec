import { fillHorizontalSpan, fillVerticalSpan, type FilledPiece } from './customShape';

export interface StageTemplate {
  id: string;
  label: string;
  build: () => FilledPiece[];
}

export interface TresenTemplate {
  id: string;
  label: string;
  build: () => { base: FilledPiece[]; top: FilledPiece[] };
}

/**
 * Rechteckige Fläche aus 1 m tiefen Reihen (Katalogzerlegung je Reihe). Die letzte Reihe ist
 * nur so tief wie der Rest (z. B. 0,5 m bei 2,5 m Gesamttiefe) — diese Resttiefe muss eine
 * Katalogtiefe sein, sonst findet die Zerlegung keine passende Platte und lässt die Lücke offen.
 */
export function fillRectArea(widthM: number, depthM: number, x0 = 0, y0 = 0): FilledPiece[] {
  const pieces: FilledPiece[] = [];
  for (let i = 0; i < Math.ceil(depthM); i++) {
    pieces.push(...fillHorizontalSpan(widthM, Math.min(1, depthM - i), x0, y0 + i));
  }
  return pieces;
}

export const STAGE_TEMPLATES: StageTemplate[] = [
  { id: 'b-4x3', label: 'Bühne 4×3 m', build: () => fillRectArea(4, 3) },
  { id: 'b-6x4', label: 'Bühne 6×4 m', build: () => fillRectArea(6, 4) },
  { id: 'b-8x4', label: 'Bühne 8×4 m', build: () => fillRectArea(8, 4) },
  {
    id: 't-steg',
    label: 'T-Steg (Bühne 6×3 m + Steg 2×4 m)',
    // Steg mittig vorne, Bühne dahinter (y wächst nach hinten, Steg läuft von y=0 bis y=4).
    build: () => [...fillRectArea(2, 4, 2, 0), ...fillRectArea(6, 3, 0, 4)],
  },
  {
    id: 'laufsteg',
    label: 'Laufsteg 2×8 m',
    build: () => [...fillVerticalSpan(8, 1, 0, 0), ...fillVerticalSpan(8, 1, 1, 0)],
  },
];

/** Gerade Theke: Unterbau 4×1 m, darauf die Thekenplatte 4×0,5 m, vorne bündig. */
function geradeTheke(): { base: FilledPiece[]; top: FilledPiece[] } {
  return {
    base: fillHorizontalSpan(4, 1, 0, 0),
    top: fillHorizontalSpan(4, 0.5, 0, 0),
  };
}

export const TRESEN_TEMPLATES: TresenTemplate[] = [
  { id: 'tresen-gerade', label: 'Tresen gerade 4 m', build: geradeTheke },
  {
    id: 'tresen-l',
    label: 'Tresen L (4 m + 2 m Schenkel)',
    build: () => {
      const gerade = geradeTheke();
      return {
        base: [...gerade.base, ...fillVerticalSpan(2, 1, 3, 1)],
        top: [...gerade.top, ...fillVerticalSpan(2.5, 0.5, 3.5, 0.5)],
      };
    },
  },
  {
    id: 'tresen-u',
    label: 'Tresen U',
    build: () => {
      const gerade = geradeTheke();
      return {
        base: [...gerade.base, ...fillVerticalSpan(2, 1, 3, 1), ...fillVerticalSpan(2, 1, 0, 1)],
        top: [...gerade.top, ...fillVerticalSpan(2.5, 0.5, 3.5, 0.5), ...fillVerticalSpan(2.5, 0.5, 0, 0.5)],
      };
    },
  },
];
