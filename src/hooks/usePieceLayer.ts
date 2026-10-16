import { useMemo } from 'react';
import { type Piece2D } from '../domain/customShape';
import { createPieceLayerProps } from '../lib/pieceLayerProps';
import { useUndoableState } from './useUndoableState';

export function usePieceLayer() {
  const { value: pieces, set, transact, undo, redo, canUndo, canRedo } = useUndoableState<Piece2D[]>([]);

  const editorProps = useMemo(
    () => createPieceLayerProps(pieces, set, { undo, redo, canUndo, canRedo, transact }),
    [pieces, set, undo, redo, canUndo, canRedo, transact],
  );

  return { pieces, replace: set, transact, editorProps };
}
