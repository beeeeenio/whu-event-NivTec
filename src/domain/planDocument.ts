import type { Piece2D } from './customShape';
import type { ForexPanel } from './types';

/**
 * Gemeinsames Dokument einer Kastenbühne — liegt als Ganzes in EINER Undo-Historie, damit Höhe,
 * Stücke und Forex-Blenden zusammen rückgängig gemacht und als ein Schritt importiert werden.
 */
export interface KastenbuehneDoc {
  heightCm: number;
  pieces: Piece2D[];
  forexPanels: ForexPanel[];
}

/** Gemeinsames Dokument eines Tresens — beide Ebenen und beide Höhen teilen sich eine Undo-Historie. */
export interface TresenDoc {
  baseHeightCm: number;
  spindelHeightCm: number;
  basePieces: Piece2D[];
  topPieces: Piece2D[];
}

/**
 * Ändert ein Feld eines Dokuments; gleiche Referenz, wenn sich das Feld nicht ändert (kein leerer Undo-Schritt).
 * Der Updater wird per typeof als Funktion erkannt — D[K] selbst darf daher nie eine Funktion sein
 * (Plan-Felder sind Zahlen, Arrays und Ähnliches).
 */
export function setDocField<D extends object, K extends keyof D>(
  doc: D,
  key: K,
  updater: D[K] | ((prev: D[K]) => D[K]),
): D {
  const next = typeof updater === 'function' ? (updater as (prev: D[K]) => D[K])(doc[key]) : updater;
  if (next === doc[key]) return doc;
  return { ...doc, [key]: next };
}
