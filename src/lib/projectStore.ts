import { draftStorageKey } from '../hooks/useDraftAutosave';
import { createDefaultStore, parseStore, type ProjectItem, type ProjectStore } from '../domain/project';
import { loadForexPrints, saveForexPrints } from './forexPrintStore';

const STORE_KEY = 'nivtec:projects:v1';

/** Liest die Projekte; beim ersten Start (oder bei beschädigten Daten) das Standardprojekt aus den alten Plänen. */
export function loadProjectStore(): ProjectStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = parseStore(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    // beschädigt oder nicht lesbar: unten neu starten
  }
  return createDefaultStore();
}

/** false, wenn das Speichern nicht geklappt hat (z. B. privater Modus oder Speicher voll). */
export function saveProjectStore(store: ProjectStore): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** Liest den gespeicherten Plan eines Tisches (Entwurf) als JSON; null, wenn noch nichts gespeichert ist. */
export function readItemDraft(item: ProjectItem): unknown {
  try {
    const raw = localStorage.getItem(draftStorageKey(item.namespace));
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Löscht Entwurf, benannte Stände und Forex-Drucke eines entfernten Tisches. */
export function deleteItemData(item: ProjectItem): void {
  try {
    localStorage.removeItem(draftStorageKey(item.namespace));
    localStorage.removeItem(`nivtec:saved:${item.namespace}`);
  } catch {
    // nichts zu tun
  }
  void saveForexPrints(item.namespace, {});
}

/** Kopiert den Plan eines Tisches (Entwurf und Forex-Drucke) in den Speicherort eines neuen Tisches. */
export async function copyItemData(from: ProjectItem, to: ProjectItem): Promise<void> {
  try {
    const raw = localStorage.getItem(draftStorageKey(from.namespace));
    if (raw) localStorage.setItem(draftStorageKey(to.namespace), raw);
  } catch {
    // Kopie ohne Entwurf: der neue Tisch startet leer
  }
  const prints = await loadForexPrints(from.namespace);
  if (Object.keys(prints).length > 0) await saveForexPrints(to.namespace, prints);
}

/** Schreibt einen importierten Plan als Entwurf des Tisches (er wird beim Öffnen des Tisches geladen). */
export function writeItemDraft(item: ProjectItem, plan: unknown): void {
  try {
    localStorage.setItem(draftStorageKey(item.namespace), JSON.stringify(plan));
  } catch {
    // Speicher voll oder gesperrt: der Tisch startet leer
  }
}
