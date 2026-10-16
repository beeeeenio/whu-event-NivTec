import { describe, it, expect } from 'vitest';
import { editorShortcut, isEditableTarget, undoRedoAction, type KeyLike } from '../shortcuts';

function key(partial: Partial<KeyLike> & { key: string }): KeyLike {
  return { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...partial };
}

describe('undoRedoAction', () => {
  it('erkennt Strg+Z als Rückgängig', () => {
    expect(undoRedoAction(key({ key: 'z', ctrlKey: true }))).toBe('undo');
  });

  it('erkennt Cmd+Z als Rückgängig', () => {
    expect(undoRedoAction(key({ key: 'z', metaKey: true }))).toBe('undo');
  });

  it('erkennt Strg+Umschalt+Z (auch in Großbuchstaben) als Wiederholen', () => {
    expect(undoRedoAction(key({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  it('erkennt Strg+Y als Wiederholen', () => {
    expect(undoRedoAction(key({ key: 'y', ctrlKey: true }))).toBe('redo');
  });

  it('ignoriert Z ohne Modifier', () => {
    expect(undoRedoAction(key({ key: 'z' }))).toBeNull();
  });

  it('ignoriert Kombinationen mit Alt', () => {
    expect(undoRedoAction(key({ key: 'z', ctrlKey: true, altKey: true }))).toBeNull();
  });

  it('ignoriert Eingaben während IME-Komposition', () => {
    expect(undoRedoAction(key({ key: 'z', ctrlKey: true, isComposing: true }))).toBeNull();
  });

  it('ignoriert andere Buchstaben mit Strg', () => {
    expect(undoRedoAction(key({ key: 'a', ctrlKey: true }))).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('erkennt Eingabefelder, Textbereiche und Auswahllisten', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
  });

  it('erkennt contenteditable-Elemente', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('lehnt SVG, Buttons, null und undefined ab', () => {
    expect(isEditableTarget({ tagName: 'svg' })).toBe(false);
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});

describe('editorShortcut', () => {
  it('erkennt Strg+A als alles auswählen', () => {
    expect(editorShortcut(key({ key: 'a', ctrlKey: true }))).toBe('selectAll');
  });

  it('erkennt Cmd+D als Duplizieren', () => {
    expect(editorShortcut(key({ key: 'd', metaKey: true }))).toBe('duplicate');
  });

  it('erkennt Strg+C, Strg+X und Strg+V als Kopieren, Ausschneiden und Einfügen', () => {
    expect(editorShortcut(key({ key: 'c', ctrlKey: true }))).toBe('copy');
    expect(editorShortcut(key({ key: 'x', ctrlKey: true }))).toBe('cut');
    expect(editorShortcut(key({ key: 'v', ctrlKey: true }))).toBe('paste');
  });

  it('ignoriert Strg+Umschalt+D', () => {
    expect(editorShortcut(key({ key: 'd', ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it('ignoriert Alt+Strg+A', () => {
    expect(editorShortcut(key({ key: 'a', ctrlKey: true, altKey: true }))).toBeNull();
  });

  it('ignoriert Eingaben während IME-Komposition', () => {
    expect(editorShortcut(key({ key: 'a', ctrlKey: true, isComposing: true }))).toBeNull();
  });

  it('liefert Undo und Redo aus undoRedoAction', () => {
    expect(editorShortcut(key({ key: 'z', ctrlKey: true }))).toBe('undo');
    expect(editorShortcut(key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  it('ignoriert Buchstaben ohne Modifier', () => {
    expect(editorShortcut(key({ key: 'a' }))).toBeNull();
    expect(editorShortcut(key({ key: 'd' }))).toBeNull();
  });
});
