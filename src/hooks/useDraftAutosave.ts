import { useEffect, useRef, useState } from 'react';
import { describeStorageError } from '../lib/storageErrors';

const DEBOUNCE_MS = 500;

export function draftStorageKey(namespace: string): string {
  return `nivtec:draft:${namespace}`;
}

/**
 * Sichert `currentData` automatisch (debounced, 500 ms nach der letzten Änderung) im
 * localStorage und lädt einen vorhandenen Entwurf einmalig beim ersten Mount — über denselben
 * Parser/Validierungspfad wie der Datei-Import (`onLoad`), damit ein beschädigter oder aus einer
 * älteren Version stammender Entwurf nie zum Absturz führt, sondern einfach ignoriert wird.
 *
 * Zusätzlich: Ausstehende Änderungen werden beim Wegwechseln des Tabs (`visibilitychange`) bzw.
 * beim Schließen (`pagehide`) sofort geschrieben, statt auf den Debounce zu warten. Ändert ein
 * anderer Tab denselben Entwurf, meldet dieser Hook das (`otherTabChanged`), damit der Nutzer den
 * Stand dort laden oder hier weiterarbeiten kann. Schlägt das Schreiben fehl (z. B. voller
 * Speicher), steht die Meldung in `saveError`.
 *
 * Bewusst komplett getrennt von den benannten Speicherständen (SavedConfigsPanel) und dem
 * Datei-Export/-Import (PlanFileBar) — reine Absicherung gegen ein versehentliches Neuladen
 * oder Schließen des Tabs, kein Ersatz für bewusstes Speichern.
 */
export function useDraftAutosave(namespace: string, currentData: unknown, onLoad: (data: unknown) => string | null) {
  const [restored, setRestored] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [otherTabChanged, setOtherTabChanged] = useState(false);
  const loadedRef = useRef(false);
  // Zustand direkt beim allerersten Render (vor einem möglichen Restore) — solange currentData
  // dem noch entspricht, wurde nichts Eigenes verändert, also gibt es auch nichts zu sichern.
  // Verhindert einen leeren "Phantom-Entwurf", der bei einem späteren Neuladen fälschlich als
  // "wiederhergestellt" gilt, obwohl der Nutzer dieses Modul nie angefasst hat.
  const initialSnapshotRef = useRef(JSON.stringify(currentData));
  // Immer der jeweils aktuelle Stand — damit Flush-Handler beim Schließen nicht auf veraltete Daten zugreifen.
  const latestRef = useRef(currentData);
  // true, wenn Daten vom Initial-Snapshot abweichen und seit dem letzten erfolgreichen Schreiben geändert wurden.
  const dirtyRef = useRef(false);

  useEffect(() => {
    latestRef.current = currentData;
  }, [currentData]);

  // Einmalig beim Mount: vorhandenen Entwurf laden, BEVOR der erste Autosave-Schreibzugriff
  // passiert — sonst würde der leere Startzustand einen echten Entwurf sofort überschreiben.
  useEffect(() => {
    loadedRef.current = true;
    try {
      const raw = localStorage.getItem(draftStorageKey(namespace));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const error = onLoad(parsed);
      if (!error) setRestored(true);
    } catch {
      // ungültiger/beschädigter Entwurf — einfach ignorieren, kein Absturz
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace]);

  function writeNow() {
    try {
      localStorage.setItem(draftStorageKey(namespace), JSON.stringify(latestRef.current));
      dirtyRef.current = false;
      setSaveError(null);
    } catch (err) {
      // bleibt dirty, damit ein späterer Flush es erneut versucht
      setSaveError(describeStorageError(err));
    }
  }

  useEffect(() => {
    if (!loadedRef.current) return;
    if (JSON.stringify(currentData) === initialSnapshotRef.current) {
      dirtyRef.current = false;
      return;
    }
    dirtyRef.current = true;
    const timeout = setTimeout(writeNow, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace, currentData]);

  // Flush beim Tab-Wechsel bzw. Schließen: ausstehende Änderungen sofort sichern.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden' && dirtyRef.current) writeNow();
    }
    function onPageHide() {
      if (dirtyRef.current) writeNow();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace]);

  // Mehr-Tab-Erkennung: das storage-Event feuert nur in anderen Tabs, nie im schreibenden Tab selbst.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === draftStorageKey(namespace) && e.newValue !== null) setOtherTabChanged(true);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [namespace]);

  function reloadFromOtherTab() {
    try {
      const raw = localStorage.getItem(draftStorageKey(namespace));
      if (raw) onLoad(JSON.parse(raw));
    } catch {
      // beschädigter Entwurf — ignorieren, kein Absturz
    }
    setOtherTabChanged(false);
  }

  function discard() {
    try {
      localStorage.removeItem(draftStorageKey(namespace));
    } catch {
      // ignorieren
    }
    setRestored(false);
  }

  return {
    restored,
    discard,
    saveError,
    otherTabChanged,
    reloadFromOtherTab,
    dismissOtherTab: () => setOtherTabChanged(false),
  };
}
