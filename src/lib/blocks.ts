import type { FilledPiece, Piece2D } from '../domain/customShape';
import { makeClipboardPayload } from '../domain/clipboard';
import { isValidPieceGeometry } from '../domain/savedState';

/** Eigener Baustein: eine gespeicherte Auswahl aus Stücken, auf (0,0) normalisiert, ohne IDs. */
export interface SavedBlock {
  id: string;
  name: string;
  pieces: FilledPiece[];
}

/** localStorage-Schlüssel für die eigenen Bausteine. Gilt für Kastenbühne und Tresen gemeinsam. */
const STORAGE_KEY = 'nivtec:blocks';

/** Fenster-Ereignis nach jeder Änderung, damit alle offenen Editoren (z. B. beide Tresen-Ebenen) neu lesen. */
export const BLOCKS_CHANGED_EVENT = 'nivtec:blocks-changed';

/** Meldet Änderungen der Bausteine (eigene Seite per Ereignis, andere Tabs per storage-Ereignis); liefert Abmelden. */
export function subscribeBlocks(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(BLOCKS_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(BLOCKS_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Normalisiert die Auswahl auf (0,0) und entfernt die IDs; null bei leerer Auswahl. Bausteine sind reine
 *  Geometrie und landen nie in der Plan-Datei. */
export function selectionToBlock(pieces: Piece2D[], ids: readonly string[], name: string, id: string): SavedBlock | null {
  const clip = makeClipboardPayload(pieces, ids);
  if (!clip) return null;
  return { id, name, pieces: clip.pieces };
}

/** Prüft einen gespeicherten Eintrag. Ein Baustein mit einem kaputten Stück wird ganz verworfen. */
function sanitizeBlock(raw: unknown): SavedBlock | null {
  const v = raw as any;
  if (!v || typeof v !== 'object') return null;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  if (!Array.isArray(v.pieces) || v.pieces.length === 0) return null;
  const pieces: FilledPiece[] = [];
  for (const item of v.pieces) {
    if (!isValidPieceGeometry(item)) return null;
    pieces.push({
      x: item.x,
      y: item.y,
      w: item.w,
      d: item.d,
      ...(item.corner !== undefined ? { corner: item.corner } : {}),
      ...(item.shape !== undefined ? { shape: item.shape } : {}),
    });
  }
  return { id: v.id, name: v.name, pieces };
}

/** Liest alle gespeicherten Bausteine. Ohne localStorage oder bei beschädigten Daten: []. */
export function listBlocks(): SavedBlock[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const blocks: SavedBlock[] = [];
    for (const item of parsed) {
      const b = sanitizeBlock(item);
      if (b) blocks.push(b);
    }
    return blocks;
  } catch {
    return [];
  }
}

function writeBlocks(blocks: SavedBlock[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
  } catch {
    // localStorage kann z.B. im privaten Modus nicht verfügbar sein — stiller Fallback wie bei den gespeicherten Konfigurationen.
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(BLOCKS_CHANGED_EVENT));
  }
}

/** Speichert den Baustein (ein gleicher id wird ersetzt) und liefert die neue Liste. */
export function saveBlock(b: SavedBlock): SavedBlock[] {
  const next = [...listBlocks().filter((x) => x.id !== b.id), b];
  writeBlocks(next);
  return next;
}

/** Entfernt den Baustein mit der id und liefert die neue Liste. */
export function deleteBlock(id: string): SavedBlock[] {
  const next = listBlocks().filter((x) => x.id !== id);
  writeBlocks(next);
  return next;
}
