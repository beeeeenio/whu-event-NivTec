/**
 * Beispiel-Plan-Dateien für die Migrations- und Import-Tests.
 * Als TS-Modul, weil tsconfig.app kein resolveJsonModule hat.
 */

/** Älteste Form (vor schemaVersion/kind) — so wie die Stadthallenplanung sie speichert. */
export const V0_KASTENBUEHNE = {
  heightCm: 60,
  pieces: [
    { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
    { id: 'piece-2', x: 2, y: 0, w: 1, d: 1 },
  ],
};

/** Tresen ohne Versionsangabe. */
export const V0_TRESEN = {
  baseHeightCm: 60,
  spindelHeightCm: 20,
  basePieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
  topPieces: [{ id: 'piece-2', x: 0, y: 0, w: 1, d: 1 }],
};

/** Aktuelle Version mit Forex-Blende. */
export const V1_KASTENBUEHNE_FOREX = {
  schemaVersion: 1,
  kind: 'kastenbuehne',
  heightCm: 60,
  pieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
  forexPanels: [{ id: 'fx-1', pieceId: 'piece-1', side: 'top' }],
};

/** Aus einer neueren Programmversion — muss abgelehnt werden. */
export const FUTURE_VERSION = {
  schemaVersion: 99,
  kind: 'kastenbuehne',
  heightCm: 60,
  pieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
};

/**
 * Kaputte Bühne: ein Stück mit w=-1 (wird verworfen), zwei Stücke mit gleicher id (eines bekommt
 * eine neue id) und eine Forex-Blende an einer unbekannten pieceId (wird verworfen).
 */
export const BROKEN_PIECES = {
  schemaVersion: 1,
  kind: 'kastenbuehne',
  heightCm: 60,
  pieces: [
    { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
    { id: 'piece-2', x: 2, y: 0, w: -1, d: 1 },
    { id: 'piece-3', x: 3, y: 0, w: 1, d: 1 },
    { id: 'piece-3', x: 5, y: 0, w: 1, d: 1 },
  ],
  forexPanels: [{ id: 'fx-1', pieceId: 'gibt-es-nicht', side: 'top' }],
};
