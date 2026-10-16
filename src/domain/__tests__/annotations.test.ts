import { describe, it, expect } from 'vitest';
import {
  addAnnotation,
  measureLength,
  moveAnnotation,
  nextAnnotationId,
  removeAnnotation,
  sanitizeAnnotations,
  shiftAnnotations,
  type PlanAnnotation,
} from '../annotations';

const text = (id: string, x = 1, y = 2): PlanAnnotation => ({ id, kind: 'text', x, y, text: 'Notiz' });
const symbol = (id: string, x = 1, y = 2): PlanAnnotation => ({ id, kind: 'symbol', symbol: 'foh', x, y });
const measure = (id: string): PlanAnnotation => ({ id, kind: 'measure', x1: 0, y1: 0, x2: 3, y2: 4 });

describe('annotations', () => {
  describe('addAnnotation', () => {
    it('vergibt die nächste freie ID und hängt die Notiz an', () => {
      const list = addAnnotation([], { kind: 'text', x: 1, y: 1, text: 'Bar' });
      expect(list).toEqual([{ id: 'an-1', kind: 'text', x: 1, y: 1, text: 'Bar' }]);

      const next = addAnnotation(list, { kind: 'symbol', symbol: 'treppe', x: 0, y: 0 });
      expect(next.map((a) => a.id)).toEqual(['an-1', 'an-2']);
      expect(list).toHaveLength(1);
    });
  });

  describe('removeAnnotation', () => {
    it('entfernt die Notiz mit der ID', () => {
      const list = [text('an-1'), symbol('an-2')];
      expect(removeAnnotation(list, 'an-1').map((a) => a.id)).toEqual(['an-2']);
    });

    it('liefert bei unbekannter ID dieselbe Referenz zurück', () => {
      const list = [text('an-1')];
      expect(removeAnnotation(list, 'gibt-es-nicht')).toBe(list);
    });
  });

  describe('moveAnnotation', () => {
    it('verschiebt Text und Symbol um (dx, dy)', () => {
      const list = [text('an-1', 1, 2), symbol('an-2', 5, 5)];
      const moved = moveAnnotation(list, 'an-2', 1, -2);
      expect(moved[1]).toEqual({ id: 'an-2', kind: 'symbol', symbol: 'foh', x: 6, y: 3 });
      expect(moved[0]).toBe(list[0]);
    });

    it('verschiebt beide Endpunkte einer Messlinie', () => {
      const moved = moveAnnotation([measure('an-3')], 'an-3', 2, 1);
      expect(moved[0]).toEqual({ id: 'an-3', kind: 'measure', x1: 2, y1: 1, x2: 5, y2: 5 });
    });

    it('lässt die Liste unverändert, wenn die ID fehlt', () => {
      const list = [text('an-1', 1, 2)];
      expect(moveAnnotation(list, 'x', 5, 5)).toEqual(list);
    });
  });

  describe('shiftAnnotations', () => {
    it('verschiebt alle Notizen gleichmäßig', () => {
      const list = [text('an-1', 1, 2), measure('an-2')];
      const shifted = shiftAnnotations(list, -1, -2);
      expect(shifted[0]).toEqual({ id: 'an-1', kind: 'text', x: 0, y: 0, text: 'Notiz' });
      expect(shifted[1]).toEqual({ id: 'an-2', kind: 'measure', x1: -1, y1: -2, x2: 2, y2: 2 });
      expect(list[0]).toEqual(text('an-1', 1, 2));
    });
  });

  describe('nextAnnotationId', () => {
    it('beginnt bei an-1', () => {
      expect(nextAnnotationId([])).toBe('an-1');
    });

    it('überspringt belegte IDs', () => {
      expect(nextAnnotationId([text('an-1'), text('an-2'), text('an-4')])).toBe('an-3');
    });
  });

  describe('measureLength', () => {
    it('berechnet 3-4-5 als 5', () => {
      expect(measureLength({ id: 'm', kind: 'measure', x1: 0, y1: 0, x2: 3, y2: 4 })).toBe(5);
    });

    it('rundet auf 3 Nachkommastellen', () => {
      expect(measureLength({ id: 'm', kind: 'measure', x1: 0, y1: 0, x2: 1, y2: 1 })).toBe(1.414);
    });
  });

  describe('sanitizeAnnotations', () => {
    it('übernimmt gültige Notizen unverändert und zählt nichts', () => {
      const raw = [text('an-1'), symbol('an-2'), measure('an-3')];
      expect(sanitizeAnnotations(raw)).toEqual({ annotations: raw, dropped: 0 });
    });

    it('liefert für keine Liste eine leere Liste', () => {
      expect(sanitizeAnnotations(undefined)).toEqual({ annotations: [], dropped: 0 });
      expect(sanitizeAnnotations('kaputt')).toEqual({ annotations: [], dropped: 0 });
    });

    it('verwirft leeren Text und trimmt Text', () => {
      const r = sanitizeAnnotations([
        { id: 'an-1', kind: 'text', x: 0, y: 0, text: '   ' },
        { id: 'an-2', kind: 'text', x: 0, y: 0, text: '  Bar  ' },
      ]);
      expect(r.dropped).toBe(1);
      expect(r.annotations).toEqual([{ id: 'an-2', kind: 'text', x: 0, y: 0, text: 'Bar' }]);
    });

    it('verwirft zu langen Text (mehr als 200 Zeichen)', () => {
      const r = sanitizeAnnotations([{ id: 'an-1', kind: 'text', x: 0, y: 0, text: 'x'.repeat(201) }]);
      expect(r.annotations).toEqual([]);
      expect(r.dropped).toBe(1);
    });

    it('verwirft negative Koordinaten', () => {
      const r = sanitizeAnnotations([
        { id: 'an-1', kind: 'symbol', symbol: 'treppe', x: -1, y: 0 },
        { id: 'an-2', kind: 'text', x: 0, y: -0.5, text: 'Ok' },
      ]);
      expect(r.annotations).toEqual([]);
      expect(r.dropped).toBe(2);
    });

    it('verwirft nicht endliche Koordinaten', () => {
      const r = sanitizeAnnotations([{ id: 'an-1', kind: 'symbol', symbol: 'foh', x: Infinity, y: 0 }]);
      expect(r.dropped).toBe(1);
    });

    it('verwirft Messlinien mit Länge 0', () => {
      const r = sanitizeAnnotations([{ id: 'an-1', kind: 'measure', x1: 2, y1: 2, x2: 2, y2: 2 }]);
      expect(r.annotations).toEqual([]);
      expect(r.dropped).toBe(1);
    });

    it('verwirft unbekannte Symbole', () => {
      const r = sanitizeAnnotations([
        { id: 'an-1', kind: 'symbol', symbol: 'bar', x: 0, y: 0 },
        symbol('an-2'),
      ]);
      expect(r.annotations.map((a) => a.id)).toEqual(['an-2']);
      expect(r.dropped).toBe(1);
    });

    it('verwirft doppelte IDs (erste gewinnt) und zählt sie', () => {
      const r = sanitizeAnnotations([text('an-1', 1, 1), text('an-1', 9, 9)]);
      expect(r.annotations).toEqual([text('an-1', 1, 1)]);
      expect(r.dropped).toBe(1);
    });

    it('verwirft Einträge ohne ID oder mit unbekanntem Typ', () => {
      const r = sanitizeAnnotations([
        { kind: 'text', x: 0, y: 0, text: 'ohne id' },
        { id: 'an-2', kind: 'unbekannt', x: 0, y: 0 },
        null,
      ]);
      expect(r.annotations).toEqual([]);
      expect(r.dropped).toBe(3);
    });
  });
});
