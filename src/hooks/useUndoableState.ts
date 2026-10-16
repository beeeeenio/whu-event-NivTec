import { useCallback, useRef, useState } from 'react';
import { applyChange, beginTx, createHistory, createTxCounter, endTx, redoHistory, txIdForSet, undoHistory, type History } from '../lib/history';

export function useUndoableState<T>(initial: T) {
  const [history, setHistory] = useState<History<T>>(() => createHistory(initial));
  const tx = useRef(createTxCounter());

  // Jeder set()-Aufruf außerhalb von transact ist ein eigener Undo-Schritt.
  const set = useCallback((updater: T | ((prev: T) => T)) => {
    const txId = txIdForSet(tx.current);
    setHistory((h) => {
      const next = typeof updater === 'function' ? (updater as (prev: T) => T)(h.present) : updater;
      return applyChange(h, next, txId);
    });
  }, []);

  // Bündelt alle set()-Aufrufe in fn zu einem Undo-Schritt.
  const transact = useCallback((fn: () => void) => {
    beginTx(tx.current);
    try {
      fn();
    } finally {
      endTx(tx.current);
    }
  }, []);

  const undo = useCallback(() => setHistory((h) => undoHistory(h)), []);
  const redo = useCallback(() => setHistory((h) => redoHistory(h)), []);

  return {
    value: history.present,
    set,
    transact,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
