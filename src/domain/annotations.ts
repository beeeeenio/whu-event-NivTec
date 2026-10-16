/**
 * Notizen, Symbole und Messlinien auf dem 2D-Plan. Rein werkzeuginterne Beschriftung: sie fließen
 * nicht in Grundriss, 3D, Materialliste oder PPTX ein. Koordinaten in Metern, Ursprung oben links.
 */

export type SymbolKind = 'treppe' | 'foh' | 'notausgang';

export const SYMBOL_LABELS: Record<SymbolKind, string> = {
  treppe: 'Treppe',
  foh: 'FOH',
  notausgang: 'Notausgang',
};

const VALID_SYMBOLS: readonly SymbolKind[] = ['treppe', 'foh', 'notausgang'];

/** Maximale Länge eines Textes (Zeichen, nach dem Trimmen). */
const TEXT_MAX_LENGTH = 200;

export type PlanAnnotation =
  | { id: string; kind: 'text'; x: number; y: number; text: string }
  | { id: string; kind: 'symbol'; symbol: SymbolKind; x: number; y: number }
  | { id: string; kind: 'measure'; x1: number; y1: number; x2: number; y2: number };

/** Eine Notiz vor der Vergabe der ID. */
export type NewAnnotation = PlanAnnotation extends infer A
  ? (A extends PlanAnnotation ? Omit<A, 'id'> : never)
  : never;

/** Länge einer Messlinie in Metern, auf 3 Nachkommastellen gerundet. */
export function measureLength(a: Extract<PlanAnnotation, { kind: 'measure' }>): number {
  return Math.round(Math.hypot(a.x2 - a.x1, a.y2 - a.y1) * 1000) / 1000;
}

/** Nächste freie ID 'an-1', 'an-2' … — belegte IDs werden übersprungen. */
export function nextAnnotationId(list: readonly PlanAnnotation[]): string {
  const used = new Set(list.map((a) => a.id));
  let n = 1;
  while (used.has(`an-${n}`)) n++;
  return `an-${n}`;
}

/** Hängt eine Notiz mit neuer ID an. */
export function addAnnotation(list: PlanAnnotation[], a: NewAnnotation): PlanAnnotation[] {
  const id = nextAnnotationId(list);
  return [...list, { ...a, id } as PlanAnnotation];
}

/** Entfernt eine Notiz. Fehlt die ID, kommt dieselbe Liste (gleiche Referenz) zurück. */
export function removeAnnotation(list: PlanAnnotation[], id: string): PlanAnnotation[] {
  if (!list.some((a) => a.id === id)) return list;
  return list.filter((a) => a.id !== id);
}

/** Verschiebt eine Notiz um (dx, dy) Meter. Messlinien verschieben beide Endpunkte. */
export function moveAnnotation(list: PlanAnnotation[], id: string, dx: number, dy: number): PlanAnnotation[] {
  return list.map((a) => (a.id === id ? shiftOne(a, dx, dy) : a));
}

/**
 * Verschiebt alle Notizen um (dx, dy) — für Exporte, deren Stücke auf (0,0) normalisiert wurden (Kastenbühne).
 */
export function shiftAnnotations(list: readonly PlanAnnotation[], dx: number, dy: number): PlanAnnotation[] {
  return list.map((a) => shiftOne(a, dx, dy));
}

function shiftOne(a: PlanAnnotation, dx: number, dy: number): PlanAnnotation {
  if (a.kind === 'measure') {
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  }
  return { ...a, x: a.x + dx, y: a.y + dy };
}

function isCoord(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= 0;
}

/** Prüft eine einzelne Notiz (ohne ID-Eindeutigkeit). Liefert die bereinigte Notiz oder null. */
function sanitizeOne(item: unknown): PlanAnnotation | null {
  if (typeof item !== 'object' || item === null) return null;
  const v = item as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return null;

  if (v.kind === 'text') {
    if (!isCoord(v.x) || !isCoord(v.y)) return null;
    if (typeof v.text !== 'string') return null;
    const text = v.text.trim();
    if (text.length < 1 || text.length > TEXT_MAX_LENGTH) return null;
    return { id: v.id, kind: 'text', x: v.x, y: v.y, text };
  }

  if (v.kind === 'symbol') {
    if (!isCoord(v.x) || !isCoord(v.y)) return null;
    if (typeof v.symbol !== 'string' || !VALID_SYMBOLS.includes(v.symbol as SymbolKind)) return null;
    return { id: v.id, kind: 'symbol', symbol: v.symbol as SymbolKind, x: v.x, y: v.y };
  }

  if (v.kind === 'measure') {
    if (!isCoord(v.x1) || !isCoord(v.y1) || !isCoord(v.x2) || !isCoord(v.y2)) return null;
    // Eine Messlinie ohne Länge ist sinnlos
    if (Math.hypot(v.x2 - v.x1, v.y2 - v.y1) <= 0) return null;
    return { id: v.id, kind: 'measure', x1: v.x1, y1: v.y1, x2: v.x2, y2: v.y2 };
  }

  return null;
}

/**
 * Bereinigt die Notizen einer Datei. Ungültige Einträge werden verworfen: keine Liste, fehlende
 * oder doppelte ID, leerer/zu langer Text, negative oder nicht endliche Koordinaten, unbekannte
 * Symbole und Messlinien ohne Länge. Liefert die Anzahl verworfener Einträge für den Import-Bericht.
 */
export function sanitizeAnnotations(raw: unknown): { annotations: PlanAnnotation[]; dropped: number } {
  if (!Array.isArray(raw)) return { annotations: [], dropped: 0 };
  const seenIds = new Set<string>();
  const result: PlanAnnotation[] = [];
  for (const item of raw) {
    const a = sanitizeOne(item);
    if (!a || seenIds.has(a.id)) continue;
    seenIds.add(a.id);
    result.push(a);
  }
  return { annotations: result, dropped: raw.length - result.length };
}
