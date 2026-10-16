import { describe, it, expect } from 'vitest';
import type { Piece2D } from '../../domain/customShape';
import { createPieceLayerProps, pruneSelection, type HistoryControls, type PiecesUpdate } from '../pieceLayerProps';

const piece = (id: string, x = 0, y = 0): Piece2D => ({ id, x, y, w: 2, d: 1 });

/** Fake-Updater: wendet jeden Updater sofort auf ein lokales Array an. */
function fakeUpdate(initial: Piece2D[]) {
  const state = { value: initial };
  const update: PiecesUpdate = (updater) => {
    state.value = updater(state.value);
  };
  return { state, update };
}

const history: HistoryControls = {
  undo: () => {},
  redo: () => {},
  canUndo: false,
  canRedo: false,
  transact: (fn) => fn(),
};

describe('createPieceLayerProps', () => {
  it('onAddPieces hängt Stücke mit frischen IDs an', () => {
    const { state, update } = fakeUpdate([piece('a')]);
    const props = createPieceLayerProps(state.value, update, history);
    props.onAddPieces([{ x: 1, y: 2, w: 2, d: 1 }]);
    expect(state.value).toHaveLength(2);
    expect(state.value[0].id).toBe('a');
    expect(state.value[1].id).not.toBe('a');
    expect(state.value[1]).toMatchObject({ x: 1, y: 2, w: 2, d: 1 });
  });

  it('onInsertPieces übernimmt die vorab vergebenen IDs', () => {
    const { state, update } = fakeUpdate([piece('a')]);
    const props = createPieceLayerProps(state.value, update, history);
    props.onInsertPieces([piece('copy-1', 3, 0)]);
    expect(state.value.map((p) => p.id)).toEqual(['a', 'copy-1']);
    expect(state.value[1]).toMatchObject({ x: 3, y: 0 });
  });

  it('onInsertPieces mit leerer Liste ist ein No-op (gleiche Referenz)', () => {
    const initial = [piece('a')];
    const { state, update } = fakeUpdate(initial);
    const props = createPieceLayerProps(state.value, update, history);
    props.onInsertPieces([]);
    expect(state.value).toBe(initial);
  });

  it('onClear bei leerem Array behält die Referenz', () => {
    const initial: Piece2D[] = [];
    const { state, update } = fakeUpdate(initial);
    const props = createPieceLayerProps(state.value, update, history);
    props.onClear();
    expect(state.value).toBe(initial);
  });

  it('onClear leert eine gefüllte Stückliste', () => {
    const { state, update } = fakeUpdate([piece('a'), piece('b')]);
    const props = createPieceLayerProps(state.value, update, history);
    props.onClear();
    expect(state.value).toEqual([]);
  });

  it('onReplaceAll mit derselben Referenz ist ein No-op', () => {
    const initial = [piece('a')];
    const { state, update } = fakeUpdate(initial);
    const props = createPieceLayerProps(state.value, update, history);
    props.onReplaceAll(state.value);
    expect(state.value).toBe(initial);
  });

  it('onReplaceAll ersetzt die ganze Liste', () => {
    const { state, update } = fakeUpdate([piece('a')]);
    const props = createPieceLayerProps(state.value, update, history);
    const next = [piece('x')];
    props.onReplaceAll(next);
    expect(state.value).toBe(next);
  });

  it('onRemovePiece und onRemovePieces entfernen die IDs', () => {
    const { state, update } = fakeUpdate([piece('a'), piece('b'), piece('c')]);
    const props = createPieceLayerProps(state.value, update, history);
    props.onRemovePiece('a');
    expect(state.value.map((p) => p.id)).toEqual(['b', 'c']);
    props.onRemovePieces(['b', 'c']);
    expect(state.value).toEqual([]);
  });

  it('onMovePiece und onMovePieces verschieben die Stücke', () => {
    const { state, update } = fakeUpdate([piece('a'), piece('b', 5, 5)]);
    const props = createPieceLayerProps(state.value, update, history);
    props.onMovePiece('a', 1, 2);
    expect(state.value[0]).toMatchObject({ x: 1, y: 2 });
    props.onMovePieces(['a', 'b'], 1, 1);
    expect(state.value[0]).toMatchObject({ x: 2, y: 3 });
    expect(state.value[1]).toMatchObject({ x: 6, y: 6 });
  });

  it('onShiftAll ist ohne Wirkung, wenn etwas über x=0 hinausrutschen würde', () => {
    const initial = [piece('a', 0.5, 0)];
    const { state, update } = fakeUpdate(initial);
    const props = createPieceLayerProps(state.value, update, history);
    props.onShiftAll(-1);
    expect(state.value).toBe(initial);
    props.onShiftAll(1);
    expect(state.value[0].x).toBe(1.5);
  });

  it('reicht Verlaufssteuerung und Felder unverändert durch', () => {
    const { state, update } = fakeUpdate([]);
    let undone = 0;
    const props = createPieceLayerProps(state.value, update, {
      ...history,
      undo: () => {
        undone += 1;
      },
      canUndo: true,
    });
    props.onUndo();
    expect(undone).toBe(1);
    expect(props.canUndo).toBe(true);
    expect(props.canRedo).toBe(false);
    expect(props.pieces).toBe(state.value);
    expect(props.onTransact).toBe(history.transact);
  });
});

describe('pruneSelection', () => {
  it('entfernt IDs, die es nicht mehr gibt', () => {
    const pieces = [piece('a'), piece('c')];
    expect(pruneSelection(['a', 'b', 'c'], pieces)).toEqual(['a', 'c']);
  });

  it('behält die Referenz, wenn nichts wegfällt', () => {
    const ids = ['a', 'c'];
    expect(pruneSelection(ids, [piece('a'), piece('c')])).toBe(ids);
  });

  it('leert die Auswahl, wenn alle Stücke weg sind', () => {
    expect(pruneSelection(['a', 'b'], [])).toEqual([]);
  });

  it('behält die Referenz bei leerer Auswahl', () => {
    const ids: string[] = [];
    expect(pruneSelection(ids, [piece('a')])).toBe(ids);
  });
});
