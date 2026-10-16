import { describe, it, expect } from 'vitest';
import { isEditableTarget, undoRedoAction, type KeyLike } from '../shortcuts';

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
