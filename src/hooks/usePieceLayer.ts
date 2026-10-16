import { useMemo } from 'react';
import { addFilledPieces, mirrorPieceById, movePieceTo, movePiecesBy, removePieceById, removePiecesByIds, rotatePieceById } from '../domain/pieceOps';
import { shiftPieces, type FilledPiece, type Piece2D } from '../domain/customShape';
import { useUndoableState } from './useUndoableState';

export function usePieceLayer() {
  const { value: pieces, set, undo, redo, canUndo, canRedo } = useUndoableState<Piece2D[]>([]);

  const editorProps = useMemo(
    () => ({
      pieces,
      onAddPieces: (filled: FilledPiece[]) => set((p) => addFilledPieces(p, filled)),
      onRemovePiece: (id: string) => set((p) => removePieceById(p, id)),
      onMovePiece: (id: string, x: number, y: number) => set((p) => movePieceTo(p, id, x, y)),
      onMovePieces: (ids: string[], dx: number, dy: number) => set((p) => movePiecesBy(p, ids, dx, dy)),
      onRemovePieces: (ids: string[]) => set((p) => removePiecesByIds(p, ids)),
      onRotatePiece: (id: string) => set((p) => rotatePieceById(p, id)),
      onMirrorPiece: (id: string) => set((p) => mirrorPieceById(p, id)),
      onShiftAll: (dx: number) => set((p) => shiftPieces(p, dx) ?? p),
      onClear: () => set((p) => (p.length > 0 ? [] : p)),
      onUndo: undo,
      onRedo: redo,
      canUndo,
      canRedo,
    }),
    [pieces, set, undo, redo, canUndo, canRedo],
  );

  return { pieces, replace: set, editorProps };
}
