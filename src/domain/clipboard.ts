import { fitsAllAt, type FilledPiece, type Piece2D } from './customShape';
import { isValidPieceGeometry } from './savedState';

/** Kennung im Text der System-Zwischenablage — fremder Text wird dadurch sicher erkannt und ignoriert. */
export const CLIPBOARD_TYPE = 'nivtec/pieces';

/** Typisierter Inhalt der Zwischenablage: Stücke auf (0,0) normalisiert, ohne IDs. */
export interface PiecesClipboardPayload {
  type: typeof CLIPBOARD_TYPE;
  version: 1;
  pieces: FilledPiece[];
}

/** Rundet auf mm-Genauigkeit, wie in pieceOps.ts. */
function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Kopie der Stücke `ids` (ohne id), auf (0,0) normalisiert. null bei leerer Auswahl. */
export function makeClipboardPayload(pieces: Piece2D[], ids: readonly string[]): PiecesClipboardPayload | null {
  const set = new Set(ids);
  const sel = pieces.filter((p) => set.has(p.id));
  if (sel.length === 0) return null;
  const minX = Math.min(...sel.map((p) => p.x));
  const minY = Math.min(...sel.map((p) => p.y));
  return {
    type: CLIPBOARD_TYPE,
    version: 1,
    pieces: sel.map((p) => ({
      x: r3(p.x - minX),
      y: r3(p.y - minY),
      w: p.w,
      d: p.d,
      ...(p.corner !== undefined ? { corner: p.corner } : {}),
      ...(p.shape !== undefined ? { shape: p.shape } : {}),
    })),
  };
}

export function serializeClipboard(p: PiecesClipboardPayload): string {
  return JSON.stringify(p);
}

/** Liest den Text der Zwischenablage. Fremder oder beschädigter Text ergibt null, nie einen Fehler. */
export function parseClipboard(text: string): PiecesClipboardPayload | null {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  if (data.type !== CLIPBOARD_TYPE || data.version !== 1) return null;
  if (!Array.isArray(data.pieces) || data.pieces.length === 0) return null;
  const pieces: FilledPiece[] = [];
  for (const item of data.pieces) {
    if (!isValidPieceGeometry(item)) return null;
    // Nur die Geometrie übernehmen — eine mitgelieferte id hat in der Zwischenablage nichts zu suchen.
    const v = item as FilledPiece;
    pieces.push({
      x: v.x,
      y: v.y,
      w: v.w,
      d: v.d,
      ...(v.corner !== undefined ? { corner: v.corner } : {}),
      ...(v.shape !== undefined ? { shape: v.shape } : {}),
    });
  }
  return { type: CLIPBOARD_TYPE, version: 1, pieces };
}

/**
 * Lage für die eingefügten Stücke: am Anker (auf das Raster gerastet, nie links/oben über 0), sonst
 * rechts neben dem Bestand auf y=0. Wenn die Stelle belegt ist, wird in Rasterschritten nach rechts
 * ausgewichen (höchstens 40 Schritte). null, wenn nichts passt.
 */
export function placeClipboard(
  existing: Piece2D[],
  payload: PiecesClipboardPayload,
  anchor: { x: number; y: number } | null,
  gridM = 0.5,
): FilledPiece[] | null {
  if (payload.pieces.length === 0) return null;
  // Die Stücke werden relativ zu ihrer linken oberen Ecke gesetzt, auch wenn die Payload nicht normalisiert ist.
  const minX = Math.min(...payload.pieces.map((p) => p.x));
  const minY = Math.min(...payload.pieces.map((p) => p.y));

  let start: { x: number; y: number };
  if (anchor) {
    start = {
      x: Math.max(0, Math.round(anchor.x / gridM) * gridM),
      y: Math.max(0, Math.round(anchor.y / gridM) * gridM),
    };
  } else {
    const maxX = existing.reduce((m, p) => Math.max(m, p.x + p.w), 0);
    start = { x: Math.ceil(maxX / gridM) * gridM, y: 0 };
  }

  for (let k = 0; k <= 40; k++) {
    const sx = start.x + k * gridM;
    const shifted: FilledPiece[] = payload.pieces.map((p) => ({
      ...p,
      x: r3(sx + (p.x - minX)),
      y: r3(start.y + (p.y - minY)),
    }));
    if (fitsAllAt(existing, shifted)) return shifted;
  }
  return null;
}

let memoryClipboard: PiecesClipboardPayload | null = null;

/** Fallback, wenn die System-Zwischenablage nicht erreichbar ist (gilt nur in diesem Tab). */
export function setMemoryClipboard(p: PiecesClipboardPayload | null): void {
  memoryClipboard = p;
}

export function getMemoryClipboard(): PiecesClipboardPayload | null {
  return memoryClipboard;
}
