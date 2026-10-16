/**
 * Versionierung und Migrationskette für Plan-Dateien (Bühne und Tresen).
 *
 * Ältere Dateien (ohne schemaVersion/kind, z. B. aus der Stadthallenplanung) werden über die
 * Kette Schritt für Schritt auf die aktuelle Version gehoben. Die Originaldaten werden nie
 * verändert — migratePlan arbeitet immer auf einer Kopie.
 */

/** Aktuelle Version des Plan-Dateiformats. Bei Format-Änderungen hochzählen und einen Schritt ergänzen. */
export const PLAN_SCHEMA_VERSION = 1;

/** Welcher Editor-Typ eine Plan-Datei erzeugt hat. */
export type PlanKind = 'kastenbuehne' | 'tresen';

/**
 * Erkennt den Plan-Typ anhand der Stück-Arrays. Ein pieces-Array gilt als Bühne — genau wie beim
 * Import. Ohne eindeutige Felder liefert die Funktion null.
 */
export function inferPlanKind(d: Record<string, unknown>): PlanKind | null {
  if (Array.isArray(d.pieces)) return 'kastenbuehne';
  if (Array.isArray(d.basePieces) || Array.isArray(d.topPieces)) return 'tresen';
  return null;
}

export type MigrationOutcome =
  | { ok: true; data: Record<string, unknown>; fromVersion: number; notes: string[] }
  | { ok: false; error: string };

interface MigrationStep {
  from: number;
  to: number;
  note: string;
  migrate: (d: Record<string, unknown>) => Record<string, unknown>;
}

/** Schritte in Reihenfolge. Jeder Schritt hebt genau eine Version an. */
const MIGRATIONS: MigrationStep[] = [
  {
    from: 0,
    to: 1,
    note: 'Plan-Datei ohne Versionsangabe (ältere Version) übernommen.',
    migrate: (d) => {
      const out: Record<string, unknown> = { ...d, schemaVersion: 1 };
      if (out.kind === undefined) {
        const kind = inferPlanKind(d);
        if (kind) out.kind = kind;
      }
      return out;
    },
  },
];

/**
 * Bringt eine Plan-Datei auf PLAN_SCHEMA_VERSION. Dateien aus einer neueren Programmversion
 * werden abgelehnt, damit nichts still verloren geht.
 */
export function migratePlan(raw: Record<string, unknown>): MigrationOutcome {
  const fromVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

  if (fromVersion > PLAN_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Diese Plan-Datei stammt aus einer neueren Programmversion (Schema ${fromVersion}). Bitte das Tool aktualisieren.`,
    };
  }

  let data: Record<string, unknown> = { ...raw };
  let version = fromVersion;
  const notes: string[] = [];

  for (const step of MIGRATIONS) {
    if (step.from === version) {
      data = step.migrate(data);
      version = step.to;
      notes.push(step.note);
    }
  }

  if (version !== PLAN_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unbekannte Plan-Version (Schema ${fromVersion}) — die Datei kann nicht übernommen werden.`,
    };
  }

  return { ok: true, data, fromVersion, notes };
}
