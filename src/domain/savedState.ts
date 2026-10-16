import { makePieceId, reservePieceIds, type Piece2D } from './customShape';
import { STRUCTURE_RULES } from './rules';
import { isCatalogTriangleBox } from './panels';
import { SPINDEL_HEIGHT_OPTIONS_CM } from './tresen';
import { FOREX_SIDES, isTrianglePiece, pieceHasSide } from './forex';
import { sanitizeRoom, type RoomPlan } from './room';
import { migratePlan, type PlanKind } from './migrations';
import type { ForexPanel, ForexSide, PieceShape, TriangleCorner } from './types';
import { sanitizeAnnotations, type PlanAnnotation } from './annotations';

/**
 * Gespeicherter Zustand einer Kastenbühne — wird als JSON exportiert/importiert.
 */
export interface KastenbuehneSavedState {
  /** Nur beim Schreiben gesetzt (siehe migrations.ts). Beim Lesen wird es nicht übernommen. */
  schemaVersion?: number;
  kind?: PlanKind;
  heightCm?: number;
  pieces: Piece2D[];
  /** Optional — ältere Dateien ohne Forex-Blenden laden weiter. */
  forexPanels?: ForexPanel[];
  /** Optional — Raumkontur mit Hindernissen; ältere Dateien ohne Raum laden weiter. */
  room?: RoomPlan;
  /** Optional — Notizen, Symbole und Messlinien; ältere Dateien ohne Notizen laden weiter. */
  annotations?: PlanAnnotation[];
}

/**
 * Gespeicherter Zustand eines Tresens — wird als JSON exportiert/importiert.
 */
export interface TresenSavedState {
  /** Nur beim Schreiben gesetzt (siehe migrations.ts). Beim Lesen wird es nicht übernommen. */
  schemaVersion?: number;
  kind?: PlanKind;
  baseHeightCm?: number;
  spindelHeightCm?: number;
  basePieces: Piece2D[];
  topPieces: Piece2D[];
  /** Optional — Raumkontur mit Hindernissen; ältere Dateien ohne Raum laden weiter. */
  room?: RoomPlan;
  /** Optional — Notizen, Symbole und Messlinien; ältere Dateien ohne Notizen laden weiter. */
  annotations?: PlanAnnotation[];
}

const VALID_CORNERS: readonly TriangleCorner[] = ['tl', 'tr', 'bl', 'br'];
const VALID_SHAPES: readonly PieceShape[] = ['viertelkreis'];

/** Prüft ob ein Wert eine gültige Stück-Geometrie darstellt — noch nicht mit id überprüft. */
export function isValidPieceGeometry(p: unknown): p is Omit<Piece2D, 'id'> {
  const v = p as any;
  if (typeof v?.x !== 'number' || !isFinite(v.x)) return false;
  if (typeof v?.y !== 'number' || !isFinite(v.y)) return false;
  if (typeof v?.w !== 'number' || !isFinite(v.w)) return false;
  if (typeof v?.d !== 'number' || !isFinite(v.d)) return false;
  if (v.w <= 0 || v.d <= 0) return false;

  // Shape-Feld und corner-Feld gehören zusammen
  if (v.shape !== undefined && v.corner === undefined) return false;
  if (v.shape !== undefined && !VALID_SHAPES.includes(v.shape)) return false;

  if (v.corner !== undefined) {
    if (!VALID_CORNERS.includes(v.corner)) return false;
    // Katalog-Dreieck-Größen: 1×1, 2×1, oder 1×2
    if (!isCatalogTriangleBox(v.w, v.d)) return false;
    // Wenn shape gesetzt ist, muss es ein gültiger Wert sein (schon oben geprüft)
  }
  return true;
}

/**
 * Bereinigt ein Array von Stücken — entfernt ungültige, reserviert bestehende IDs,
 * vergibt neue IDs für fehlende oder wiederholte. Liefert zusätzlich Zähler für den Import-Bericht.
 */
export function sanitizePiecesWithReport(raw: unknown): {
  pieces: Piece2D[];
  dropped: number;
  reassignedIds: number;
} {
  if (!Array.isArray(raw)) return { pieces: [], dropped: 0, reassignedIds: 0 };

  // Zuerst alle gültigen Stücke filtern und ihre bestehenden IDs sammeln
  const validGeometries: { geom: Omit<Piece2D, 'id'>; rawId: unknown }[] = [];
  const existingIds = new Set<string>();

  for (const item of raw) {
    if (isValidPieceGeometry(item)) {
      const rawId = (item as any).id;
      validGeometries.push({ geom: item, rawId });
      if (typeof rawId === 'string' && rawId) {
        existingIds.add(rawId);
      }
    }
  }

  // Bestehende IDs reservieren
  reservePieceIds(existingIds);

  // Jetzt Stücke mit validen oder neuen IDs zusammensetzen
  const seenIds = new Set<string>();
  const result: Piece2D[] = [];
  let reassignedIds = 0;

  for (const { geom, rawId } of validGeometries) {
    let id: string;
    if (typeof rawId === 'string' && rawId && !seenIds.has(rawId)) {
      id = rawId;
    } else {
      // Fehlende, nicht-String oder wiederholte ID
      id = makePieceId();
      reassignedIds++;
    }
    seenIds.add(id);
    result.push({ ...geom, id });
  }

  return { pieces: result, dropped: raw.length - validGeometries.length, reassignedIds };
}

/** Bereinigt ein Array von Stücken — wie sanitizePiecesWithReport, nur die Stücke. */
export function sanitizePieces(raw: unknown): Piece2D[] {
  return sanitizePiecesWithReport(raw).pieces;
}

/**
 * Bereinigt Forex-Blenden gegen die (bereits bereinigten) Stücke. Ungültige Einträge werden
 * verworfen: fehlende/doppelte id, unbekannte pieceId, ungültige side, 'hyp' bei Nicht-Dreiecken,
 * eine Kante, die das Podest gar nicht hat (z. B. 'bottom' bei Dreieck 'tl'), oder eine zweite
 * Blende an derselben Kante. Ungültige optionale Felder fallen einzeln weg.
 * Liefert zusätzlich die Anzahl verworfener Einträge für den Import-Bericht.
 */
export function sanitizeForexPanelsWithReport(
  raw: unknown,
  pieces: Piece2D[],
): { panels: ForexPanel[]; dropped: number } {
  if (!Array.isArray(raw)) return { panels: [], dropped: 0 };
  const piecesById = new Map(pieces.map((p) => [p.id, p]));
  const seenIds = new Set<string>();
  const seenEdges = new Set<string>();
  const result: ForexPanel[] = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const v = item as Record<string, unknown>;
    if (typeof v.id !== 'string' || !v.id || seenIds.has(v.id)) continue;
    if (typeof v.pieceId !== 'string') continue;
    const piece = piecesById.get(v.pieceId);
    if (!piece) continue;
    if (typeof v.side !== 'string' || !FOREX_SIDES.includes(v.side as ForexSide)) continue;
    const side = v.side as ForexSide;
    if (side === 'hyp' && !isTrianglePiece(piece)) continue;
    if (!pieceHasSide(piece, side)) continue;
    const edgeKey = `${piece.id}::${side}`;
    if (seenEdges.has(edgeKey)) continue;

    const panel: ForexPanel = { id: v.id, pieceId: piece.id, side };
    if (typeof v.thicknessMm === 'number' && isFinite(v.thicknessMm) && v.thicknessMm > 0) {
      panel.thicknessMm = v.thicknessMm;
    }
    if (typeof v.printGroup === 'string' && v.printGroup) {
      panel.printGroup = v.printGroup;
    }
    seenIds.add(v.id);
    seenEdges.add(edgeKey);
    result.push(panel);
  }
  return { panels: result, dropped: raw.length - result.length };
}

/** Bereinigt Forex-Blenden gegen die Stücke — ohne Zähler. */
export function sanitizeForexPanels(raw: unknown, pieces: Piece2D[]): ForexPanel[] {
  return sanitizeForexPanelsWithReport(raw, pieces).panels;
}

/**
 * Ergebnis eines Imports. `warnings` nennen nur tatsächlich verworfene oder neu vergebene Daten
 * (kein Bericht bei sauberen Dateien). Migrationshinweise fließen bewusst nicht hier hinein.
 */
export type ParseResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; error: string };

/**
 * Liest die optionale Raumkontur einer Datei. Fehlt das Feld, passiert nichts. Ist der Raum
 * ungültig, kommt eine Warnung; verworfene Hindernisse werden einzeln gemeldet.
 */
function readRoom(obj: Record<string, unknown>, warnings: string[]): RoomPlan | undefined {
  if (!('room' in obj)) return undefined;
  const roomReport = sanitizeRoom(obj.room);
  if (!roomReport.room) {
    warnings.push('Raumkontur ungültig – ignoriert.');
    return undefined;
  }
  if (roomReport.dropped > 0) {
    warnings.push(`${roomReport.dropped} ungültige Hindernisse verworfen.`);
  }
  return roomReport.room;
}

/**
 * Liest die optionalen Notizen einer Datei. Fehlt das Feld, passiert nichts. Verworfene Einträge
 * kommen als Warnung. Eine leere Liste wird nicht übernommen (Datei ohne Notizen bleibt wie bisher).
 */
function readAnnotations(obj: Record<string, unknown>, warnings: string[]): PlanAnnotation[] | undefined {
  if (!('annotations' in obj)) return undefined;
  const report = sanitizeAnnotations(obj.annotations);
  if (report.dropped > 0) {
    warnings.push(`${report.dropped} ungültige Notizen/Symbole verworfen.`);
  }
  return report.annotations.length > 0 ? report.annotations : undefined;
}

/**
 * Validiert und parsed eine Kastenbühne-Datei — prüft ob sie wirklich eine Bühne ist
 * (nicht versehentlich ein Tresen), und ob sie die notwendigen Felder hat.
 */
export function parseKastenbuehneFile(data: unknown): ParseResult<KastenbuehneSavedState> {
  // Nicht-Objekt ablehnen
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      ok: false,
      error: 'Datei konnte nicht gelesen werden — ist es eine gültige NivTec-JSON-Datei?',
    };
  }

  const raw = data as Record<string, unknown>;

  // Ältere Versionen auf die aktuelle Version heben (Kopie, Original bleibt unverändert)
  const migrated = migratePlan(raw);
  if (!migrated.ok) {
    return { ok: false, error: migrated.error };
  }
  const obj = migrated.data;

  // Explizit gesetzter kind passt nicht zur Bühne → klare Meldung
  if (raw.kind === 'tresen') {
    return {
      ok: false,
      error: 'Das ist ein Tresen-Plan — bitte im Tab „Tresen / Theken“ öffnen.',
    };
  }

  // Ist das vielleicht ein Tresen-Plan?
  if (!Array.isArray(obj.pieces) && (Array.isArray(obj.basePieces) || Array.isArray(obj.topPieces))) {
    return {
      ok: false,
      error: 'Das ist ein Tresen-Plan — bitte im Tab „Tresen / Theken“ öffnen.',
    };
  }

  // Muss ein pieces-Array haben — sonst würde ein falsches Objekt den Plan still leeren
  if (!Array.isArray(obj.pieces)) {
    return {
      ok: false,
      error: 'Keine Bühnen-Daten gefunden (Feld „pieces“ fehlt).',
    };
  }

  // pieces bereinigen
  const piecesReport = sanitizePiecesWithReport(obj.pieces);
  const pieces = piecesReport.pieces;
  const warnings: string[] = [];
  if (piecesReport.dropped > 0) {
    warnings.push(`${piecesReport.dropped} ungültige Stücke verworfen.`);
  }
  if (piecesReport.reassignedIds > 0) {
    warnings.push(`${piecesReport.reassignedIds} doppelte oder fehlende Stück-IDs neu vergeben.`);
  }

  // heightCm validieren, falls vorhanden
  let heightCm: number | undefined = undefined;
  if ('heightCm' in obj && typeof obj.heightCm === 'number') {
    if (STRUCTURE_RULES.buehne.heightOptionsCm.includes(obj.heightCm)) {
      heightCm = obj.heightCm;
    }
  }

  // Forex-Blenden nur übernehmen, wenn die Datei welche mitbringt (alte Dateien: Feld fehlt)
  let forexPanels: ForexPanel[] | undefined = undefined;
  if ('forexPanels' in obj) {
    const forexReport = sanitizeForexPanelsWithReport(obj.forexPanels, pieces);
    forexPanels = forexReport.panels;
    if (forexReport.dropped > 0) {
      warnings.push(`${forexReport.dropped} Forex-Blenden ohne passende Kante verworfen.`);
    }
  }

  const room = readRoom(obj, warnings);
  const annotations = readAnnotations(obj, warnings);

  return {
    ok: true,
    value: { heightCm, pieces, forexPanels, ...(room ? { room } : {}), ...(annotations ? { annotations } : {}) },
    warnings,
  };
}

/**
 * Validiert und parsed eine Tresen-Datei — prüft ob sie wirklich ein Tresen ist
 * (nicht versehentlich eine Bühne), und ob sie die notwendigen Felder hat.
 */
export function parseTresenFile(data: unknown): ParseResult<TresenSavedState> {
  // Nicht-Objekt ablehnen
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      ok: false,
      error: 'Datei konnte nicht gelesen werden — ist es eine gültige NivTec-JSON-Datei?',
    };
  }

  const raw = data as Record<string, unknown>;

  // Ältere Versionen auf die aktuelle Version heben (Kopie, Original bleibt unverändert)
  const migrated = migratePlan(raw);
  if (!migrated.ok) {
    return { ok: false, error: migrated.error };
  }
  const obj = migrated.data;

  // Explizit gesetzter kind passt nicht zum Tresen → klare Meldung
  if (raw.kind === 'kastenbuehne') {
    return {
      ok: false,
      error: 'Das ist ein Bühnen-Plan — bitte im Tab „Bühne“ öffnen.',
    };
  }

  // Muss mindestens eines der Ebenen-Arrays haben
  const hasBasePieces = Array.isArray(obj.basePieces);
  const hasTopPieces = Array.isArray(obj.topPieces);

  // Ist das vielleicht ein Bühnen-Plan?
  if (Array.isArray(obj.pieces) && !hasBasePieces && !hasTopPieces) {
    return {
      ok: false,
      error: 'Das ist ein Bühnen-Plan — bitte im Tab „Bühne“ öffnen.',
    };
  }

  if (!hasBasePieces && !hasTopPieces) {
    return {
      ok: false,
      error: 'Keine Tresen-Daten gefunden (Felder „basePieces“/„topPieces“ fehlen).',
    };
  }

  // Beide Ebenen bereinigen (fehlende werden zu [])
  const baseReport = hasBasePieces ? sanitizePiecesWithReport(obj.basePieces) : null;
  const topReport = hasTopPieces ? sanitizePiecesWithReport(obj.topPieces) : null;
  const basePieces = baseReport?.pieces ?? [];
  const topPieces = topReport?.pieces ?? [];

  const dropped = (baseReport?.dropped ?? 0) + (topReport?.dropped ?? 0);
  const reassignedIds = (baseReport?.reassignedIds ?? 0) + (topReport?.reassignedIds ?? 0);
  const warnings: string[] = [];
  if (dropped > 0) {
    warnings.push(`${dropped} ungültige Stücke verworfen.`);
  }
  if (reassignedIds > 0) {
    warnings.push(`${reassignedIds} doppelte oder fehlende Stück-IDs neu vergeben.`);
  }

  // Höhen validieren, falls vorhanden
  let baseHeightCm: number | undefined = undefined;
  if ('baseHeightCm' in obj && typeof obj.baseHeightCm === 'number') {
    if (STRUCTURE_RULES.tresen.heightOptionsCm.includes(obj.baseHeightCm)) {
      baseHeightCm = obj.baseHeightCm;
    }
  }

  let spindelHeightCm: number | undefined = undefined;
  if ('spindelHeightCm' in obj && typeof obj.spindelHeightCm === 'number') {
    if (SPINDEL_HEIGHT_OPTIONS_CM.includes(obj.spindelHeightCm)) {
      spindelHeightCm = obj.spindelHeightCm;
    }
  }

  const room = readRoom(obj, warnings);
  const annotations = readAnnotations(obj, warnings);

  return {
    ok: true,
    value: {
      baseHeightCm,
      spindelHeightCm,
      basePieces,
      topPieces,
      ...(room ? { room } : {}),
      ...(annotations ? { annotations } : {}),
    },
    warnings,
  };
}
