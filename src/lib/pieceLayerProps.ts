import {
  addFilledPieces,
  mirrorPieceById,
  movePieceTo,
  movePiecesBy,
  removePieceById,
  removePiecesByIds,
  rotatePieceById,
} from '../domain/pieceOps';
import { shiftPieces, type FilledPiece, type Piece2D } from '../domain/customShape';

/** Wendet einen Updater auf die Stückliste an (ein Aufruf = ein Undo-Schritt, sofern nicht gebündelt). */
export type PiecesUpdate = (updater: (prev: Piece2D[]) => Piece2D[]) => void;

/** Rückgängig/Wiederholen/Bündeln aus useUndoableState — hier nur als Schnittstelle, ohne React. */
export interface HistoryControls {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  transact: (fn: () => void) => void;
}

/**
 * Baut die Props, die PieceCanvasEditor erhält, aus Stückliste, Updater und Verlaufssteuerung.
 * Rein (ohne React), damit die Callbacks einzeln testbar sind und ein späterer gemeinsamer
 * Dokumentverlauf nur an einer Stelle umgehängt werden muss.
 */
export function createPieceLayerProps(pieces: Piece2D[], update: PiecesUpdate, h: HistoryControls) {
  return {
    pieces,
    onAddPieces: (filled: FilledPiece[]) => update((p) => addFilledPieces(p, filled)),
    /** Fügt Stücke mit bereits vergebenen IDs ein — damit die Kopie danach ausgewählt werden kann. */
    onInsertPieces: (withIds: Piece2D[]) => update((p) => (withIds.length ? [...p, ...withIds] : p)),
    onRemovePiece: (id: string) => update((p) => removePieceById(p, id)),
    onMovePiece: (id: string, x: number, y: number) => update((p) => movePieceTo(p, id, x, y)),
    onMovePieces: (ids: string[], dx: number, dy: number) => update((p) => movePiecesBy(p, ids, dx, dy)),
    onRemovePieces: (ids: string[]) => update((p) => removePiecesByIds(p, ids)),
    onRotatePiece: (id: string) => update((p) => rotatePieceById(p, id)),
    onReplaceAll: (next: Piece2D[]) => update((p) => (next === p ? p : next)),
    onMirrorPiece: (id: string) => update((p) => mirrorPieceById(p, id)),
    onShiftAll: (dx: number) => update((p) => shiftPieces(p, dx) ?? p),
    onClear: () => update((p) => (p.length > 0 ? [] : p)),
    onTransact: h.transact,
    onUndo: h.undo,
    onRedo: h.redo,
    canUndo: h.canUndo,
    canRedo: h.canRedo,
  };
}

export type PieceLayerProps = ReturnType<typeof createPieceLayerProps>;

/** Entfernt IDs, die es nach Undo/Redo/Import nicht mehr gibt; gleiche Referenz, wenn nichts wegfällt. */
export function pruneSelection(ids: string[], pieces: readonly Piece2D[]): string[] {
  const existing = new Set(pieces.map((p) => p.id));
  if (ids.every((id) => existing.has(id))) return ids;
  return ids.filter((id) => existing.has(id));
}
