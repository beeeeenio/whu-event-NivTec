import { describe, it, expect } from 'vitest';
import { migratePlan, inferPlanKind, PLAN_SCHEMA_VERSION } from '../migrations';
import { parseKastenbuehneFile, parseTresenFile } from '../savedState';
import {
  V0_KASTENBUEHNE,
  V0_TRESEN,
  V1_KASTENBUEHNE_FOREX,
  FUTURE_VERSION,
  BROKEN_PIECES,
} from './fixtures/planFixtures';

describe('migrations', () => {
  describe('inferPlanKind', () => {
    it('erkennt eine Bühne am pieces-Array', () => {
      expect(inferPlanKind({ pieces: [] })).toBe('kastenbuehne');
    });

    it('erkennt einen Tresen an basePieces oder topPieces', () => {
      expect(inferPlanKind({ basePieces: [] })).toBe('tresen');
      expect(inferPlanKind({ topPieces: [] })).toBe('tresen');
    });

    it('liefert null ohne eindeutige Felder', () => {
      expect(inferPlanKind({ heightCm: 60 })).toBeNull();
    });
  });

  describe('migratePlan', () => {
    it('hebt eine Datei ohne Version auf die aktuelle Version (Bühne)', () => {
      const result = migratePlan(V0_KASTENBUEHNE);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fromVersion).toBe(0);
        expect(result.data.kind).toBe('kastenbuehne');
        expect(result.data.schemaVersion).toBe(1);
        expect(result.notes).toHaveLength(1);
        expect(result.notes[0]).toContain('ohne Versionsangabe');
      }
    });

    it('erkennt einen Tresen ohne Version', () => {
      const result = migratePlan(V0_TRESEN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.kind).toBe('tresen');
        expect(result.data.schemaVersion).toBe(1);
        expect(result.notes).toHaveLength(1);
      }
    });

    it('lässt eine aktuelle Datei unverändert und ohne Hinweis', () => {
      const result = migratePlan(V1_KASTENBUEHNE_FOREX);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fromVersion).toBe(PLAN_SCHEMA_VERSION);
        expect(result.data).toEqual(V1_KASTENBUEHNE_FOREX);
        expect(result.notes).toEqual([]);
      }
    });

    it('verändert das Original-Objekt nicht', () => {
      const copy = JSON.parse(JSON.stringify(V0_KASTENBUEHNE));
      migratePlan(V0_KASTENBUEHNE);
      expect(V0_KASTENBUEHNE).toEqual(copy);
    });

    it('lehnt Dateien aus einer neueren Programmversion mit klarer Meldung ab', () => {
      const result = migratePlan(FUTURE_VERSION);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('neueren Programmversion');
        expect(result.error).toContain('99');
      }
    });
  });

  describe('Import über parseKastenbuehneFile / parseTresenFile', () => {
    it('lädt eine alte Bühne ohne Warnung', () => {
      const result = parseKastenbuehneFile(V0_KASTENBUEHNE);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings).toEqual([]);
        expect(result.value.pieces).toHaveLength(2);
        expect(result.value.heightCm).toBe(60);
        expect(result.value).not.toHaveProperty('schemaVersion');
        expect(result.value).not.toHaveProperty('kind');
      }
    });

    it('lädt einen alten Tresen ohne Warnung', () => {
      const result = parseTresenFile(V0_TRESEN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings).toEqual([]);
        expect(result.value.basePieces).toHaveLength(1);
        expect(result.value.topPieces).toHaveLength(1);
      }
    });

    it('meldet verworfene Stücke, neu vergebene IDs und verworfene Forex-Blenden', () => {
      const result = parseKastenbuehneFile(BROKEN_PIECES);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pieces).toHaveLength(3);
        expect(result.warnings).toEqual([
          '1 ungültige Stücke verworfen.',
          '1 doppelte oder fehlende Stück-IDs neu vergeben.',
          '1 Forex-Blenden ohne passende Kante verworfen.',
        ]);
      }
    });

    it('meldet bei Forex-Blenden nichts, wenn alles passt', () => {
      const result = parseKastenbuehneFile(V1_KASTENBUEHNE_FOREX);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings).toEqual([]);
        expect(result.value.forexPanels).toHaveLength(1);
      }
    });

    it('zeigt bei kind "tresen" die Tresen-Meldung in der Bühne', () => {
      const result = parseKastenbuehneFile({ ...V0_KASTENBUEHNE, kind: 'tresen' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Tresen-Plan');
      }
    });

    it('zeigt bei kind "kastenbuehne" die Bühnen-Meldung im Tresen', () => {
      const result = parseTresenFile({ ...V0_KASTENBUEHNE, kind: 'kastenbuehne' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Bühnen-Plan');
      }
    });

    it('lehnt eine Datei aus der Zukunft beim Import ab', () => {
      const result = parseKastenbuehneFile(FUTURE_VERSION);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('neueren Programmversion');
      }
    });
  });
});
