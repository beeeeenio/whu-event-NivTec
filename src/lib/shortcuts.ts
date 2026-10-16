/** Minimale Tastendaten, damit die Erkennung ohne DOM-Typen testbar bleibt. */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
}

/** Erkennt Strg/Cmd+Z (Rückgängig), Strg/Cmd+Umschalt+Z und Strg/Cmd+Y (Wiederholen). IME-Eingaben und Alt-Kombinationen bleiben unberührt. */
export function undoRedoAction(e: KeyLike): 'undo' | 'redo' | null {
  if (e.isComposing || e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y') return 'redo';
  return null;
}

/** Eingabefelder (inkl. Auswahllisten und contenteditable) behalten ihr natives Undo/Redo und ihre Tasten. */
export function isEditableTarget(target: unknown): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null | undefined;
  if (!el) return false;
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === 'string' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName.toUpperCase());
}
