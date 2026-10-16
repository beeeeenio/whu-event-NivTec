/**
 * Lokaler Speicher für Forex-Druckbilder (IndexedDB statt localStorage — die verkleinerten JPEGs
 * sind schnell einige hundert KB groß). Die Drucke sind bewusst NICHT Teil der Plan-Datei
 * (gemeinsames Format mit der Stadthallenplanung, siehe docs/integration.md).
 */
export type ForexPrints = Record<string, string>;

const DB_NAME = 'nivtec';
const STORE = 'forexPrints';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB nicht verfügbar'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Drucke eines Namensraums laden — leer, wenn nichts gespeichert ist oder IndexedDB fehlt. */
export async function loadForexPrints(namespace: string): Promise<ForexPrints> {
  try {
    const db = await openDb();
    return await new Promise<ForexPrints>((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(namespace);
      req.onsuccess = () => resolve((req.result as ForexPrints | undefined) ?? {});
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

/** Drucke eines Namensraums speichern. false, wenn das Speichern nicht geklappt hat. */
export async function saveForexPrints(namespace: string, prints: ForexPrints): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(prints, namespace);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}
