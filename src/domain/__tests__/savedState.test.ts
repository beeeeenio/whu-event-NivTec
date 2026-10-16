import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseKastenbuehneFile,
  parseTresenFile,
  sanitizePieces,
  isValidPieceGeometry,
} from '../savedState';
import { reservePieceIds, makePieceId } from '../customShape';

describe('savedState', () => {
  describe('parseKastenbuehneFile', () => {
    it('parses a valid Bühne file', () => {
      const validData = {
        heightCm: 60,
        pieces: [
          { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
          { id: 'piece-2', x: 2, y: 0, w: 1, d: 1 },
        ],
      };
      const result = parseKastenbuehneFile(validData);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.heightCm).toBe(60);
        expect(result.value.pieces).toHaveLength(2);
        expect(result.value.pieces[0].id).toBe('piece-1');
      }
    });

    it('round-trips a valid Bühne file unchanged', () => {
      const validData = {
        heightCm: 80,
        pieces: [
          { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
          { id: 'piece-2', x: 2, y: 0, w: 1, d: 2 },
        ],
      };
      const result = parseKastenbuehneFile(validData);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          heightCm: 80,
          pieces: validData.pieces,
        });
      }
    });

    it('rejects a non-object', () => {
      const result = parseKastenbuehneFile('not an object');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Datei konnte nicht gelesen werden — ist es eine gültige NivTec-JSON-Datei?');
      }
    });

    it('rejects null', () => {
      const result = parseKastenbuehneFile(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Datei konnte nicht gelesen werden — ist es eine gültige NivTec-JSON-Datei?');
      }
    });

    it('rejects an array', () => {
      const result = parseKastenbuehneFile([]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Datei konnte nicht gelesen werden — ist es eine gültige NivTec-JSON-Datei?');
      }
    });

    it('rejects a Tresen file with Tresen-specific message', () => {
      const tresenData = {
        baseHeightCm: 60,
        basePieces: [],
        topPieces: [],
      };
      const result = parseKastenbuehneFile(tresenData);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Tresen');
      }
    });

    it('rejects missing pieces field', () => {
      const result = parseKastenbuehneFile({ heightCm: 60 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('pieces');
      }
    });

    it('drops invalid pieces', () => {
      const result = parseKastenbuehneFile({
        heightCm: 60,
        pieces: [
          { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
          { id: 'piece-2', x: 1, y: 0, w: 0, d: 1 }, // invalid: w=0
          { id: 'piece-3', x: 'not a number', y: 0, w: 1, d: 1 }, // invalid: x not a number
        ],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pieces).toHaveLength(1);
        expect(result.value.pieces[0].id).toBe('piece-1');
      }
    });

    it('handles undefined heightCm when not in valid options', () => {
      const result = parseKastenbuehneFile({
        heightCm: 50, // not a valid option (20, 40, 60, 80, ...)
        pieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.heightCm).toBeUndefined();
      }
    });

    it('handles missing heightCm gracefully', () => {
      const result = parseKastenbuehneFile({
        pieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.heightCm).toBeUndefined();
      }
    });
  });

  describe('parseTresenFile', () => {
    it('parses a valid Tresen file', () => {
      const validData = {
        baseHeightCm: 60,
        spindelHeightCm: 20,
        basePieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
        topPieces: [{ id: 'piece-2', x: 0, y: 0, w: 1, d: 1 }],
      };
      const result = parseTresenFile(validData);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseHeightCm).toBe(60);
        expect(result.value.spindelHeightCm).toBe(20);
        expect(result.value.basePieces).toHaveLength(1);
        expect(result.value.topPieces).toHaveLength(1);
      }
    });

    it('round-trips a valid Tresen file unchanged', () => {
      const validData = {
        baseHeightCm: 80,
        spindelHeightCm: 30,
        basePieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
        topPieces: [{ id: 'piece-2', x: 0, y: 0, w: 1, d: 2 }],
      };
      const result = parseTresenFile(validData);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(validData);
      }
    });

    it('rejects a Bühne file with Bühne-specific message', () => {
      const buehneData = {
        heightCm: 60,
        pieces: [],
      };
      const result = parseTresenFile(buehneData);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Bühne');
      }
    });

    it('accepts Tresen with only basePieces', () => {
      const data = {
        baseHeightCm: 60,
        basePieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
      };
      const result = parseTresenFile(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.basePieces).toHaveLength(1);
        expect(result.value.topPieces).toHaveLength(0);
      }
    });

    it('accepts Tresen with only topPieces', () => {
      const data = {
        topPieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
      };
      const result = parseTresenFile(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.basePieces).toHaveLength(0);
        expect(result.value.topPieces).toHaveLength(1);
      }
    });

    it('rejects Tresen without any pieces arrays', () => {
      const result = parseTresenFile({
        baseHeightCm: 60,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('basePieces');
      }
    });

    it('drops invalid pieces', () => {
      const result = parseTresenFile({
        basePieces: [
          { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
          { id: 'piece-2', x: 1, y: 0, w: 0, d: 1 }, // invalid: w=0
          { id: 'piece-3', x: 'not a number', y: 0, w: 1, d: 1 }, // invalid: x not a number
        ],
        topPieces: [],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.basePieces).toHaveLength(1);
        expect(result.value.basePieces[0].id).toBe('piece-1');
      }
    });

    it('handles undefined heights when not in valid options', () => {
      const result = parseTresenFile({
        baseHeightCm: 50, // not a valid option
        spindelHeightCm: 15, // not a valid option (10, 20, 30, 40)
        basePieces: [],
        topPieces: [],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseHeightCm).toBeUndefined();
        expect(result.value.spindelHeightCm).toBeUndefined();
      }
    });
  });

  describe('Raumkontur (room)', () => {
    const room = {
      widthM: 10,
      depthM: 8,
      obstacles: [{ id: 'ob-1', kind: 'saeule', x: 2, y: 2, w: 0.5, d: 0.5, label: 'Mitte' }],
    };

    it('Bühne: Datei mit room lädt im Roundtrip', () => {
      const result = parseKastenbuehneFile({
        heightCm: 60,
        pieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
        room,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.room).toEqual(room);
        expect(result.warnings).toEqual([]);
      }
    });

    it('Tresen: Datei mit room lädt im Roundtrip', () => {
      const data = {
        baseHeightCm: 60,
        basePieces: [{ id: 'piece-1', x: 0, y: 0, w: 2, d: 1 }],
        topPieces: [],
        room,
      };
      const result = parseTresenFile(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(data);
      }
    });

    it('ohne room ist das Feld nicht im value', () => {
      const bühne = parseKastenbuehneFile({ heightCm: 60, pieces: [] });
      const tresen = parseTresenFile({ basePieces: [], topPieces: [] });
      expect(bühne.ok && 'room' in bühne.value).toBe(false);
      expect(tresen.ok && 'room' in tresen.value).toBe(false);
    });

    it('ungültiger room ergibt eine Warnung und wird ignoriert', () => {
      const result = parseKastenbuehneFile({
        heightCm: 60,
        pieces: [],
        room: { widthM: -1, depthM: 8, obstacles: [] },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.room).toBeUndefined();
        expect('room' in result.value).toBe(false);
        expect(result.warnings).toEqual(['Raumkontur ungültig – ignoriert.']);
      }
    });

    it('verworfene Hindernisse werden im Bericht genannt', () => {
      const result = parseTresenFile({
        basePieces: [],
        topPieces: [],
        room: {
          widthM: 10,
          depthM: 8,
          obstacles: [
            { id: 'ob-1', kind: 'tuer', x: 0, y: 0, w: 1, d: 1 },
            { id: 'ob-2', kind: 'tuer', x: 0, y: 0, w: 0, d: 1 },
          ],
        },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.room?.obstacles).toHaveLength(1);
        expect(result.warnings).toEqual(['1 ungültige Hindernisse verworfen.']);
      }
    });
  });

  describe('sanitizePieces', () => {
    it('replaces duplicate id with a unique one', () => {
      const pieces = [
        { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
        { id: 'piece-1', x: 1, y: 0, w: 1, d: 1 }, // duplicate id
      ];
      const result = sanitizePieces(pieces);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('piece-1');
      expect(result[1].id).not.toBe('piece-1'); // should have a fresh id
    });

    it('replaces missing id with a fresh one', () => {
      const pieces = [
        { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
        { x: 1, y: 0, w: 1, d: 1 }, // missing id
      ];
      const result = sanitizePieces(pieces as any[]);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('piece-1');
      expect(result[1].id).toBeTruthy();
      expect(result[1].id.startsWith('piece-')).toBe(true);
    });

    it('returns empty array for non-array input', () => {
      const result = sanitizePieces('not an array');
      expect(result).toEqual([]);
    });

    it('returns empty array for null input', () => {
      const result = sanitizePieces(null);
      expect(result).toEqual([]);
    });

    it('drops pieces with w=0', () => {
      const pieces = [
        { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
        { id: 'piece-2', x: 1, y: 0, w: 0, d: 1 }, // invalid: w=0
      ];
      const result = sanitizePieces(pieces as any[]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('piece-1');
    });

    it('drops pieces with non-numeric x', () => {
      const pieces = [
        { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
        { id: 'piece-2', x: 'not a number', y: 0, w: 1, d: 1 },
      ];
      const result = sanitizePieces(pieces as any[]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('piece-1');
    });

    it('accepts both 1×1 and 2×1 triangles with corner (Phase 6)', () => {
      const pieces = [
        { id: 'piece-1', x: 0, y: 0, w: 1, d: 1, corner: 'tl' }, // valid 1×1 triangle
        { id: 'piece-2', x: 1, y: 0, w: 2, d: 1, corner: 'tl' }, // valid 2×1 triangle
        { id: 'piece-3', x: 2, y: 0, w: 1, d: 2, corner: 'tl' }, // valid 1×2 triangle
      ];
      const result = sanitizePieces(pieces as any[]);
      expect(result).toHaveLength(3);
    });

    it('keeps pieces with negative x/y', () => {
      const pieces = [
        { id: 'piece-1', x: -1, y: -0.5, w: 2, d: 1 },
      ];
      const result = sanitizePieces(pieces as any[]);
      expect(result).toHaveLength(1);
      expect(result[0].x).toBe(-1);
      expect(result[0].y).toBe(-0.5);
    });

    it('keeps pieces without corner', () => {
      const pieces = [
        { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
      ];
      const result = sanitizePieces(pieces as any[]);
      expect(result).toHaveLength(1);
      expect(result[0].corner).toBeUndefined();
    });
  });

  describe('isValidPieceGeometry', () => {
    it('accepts a valid rectangular piece', () => {
      const piece = { x: 0, y: 0, w: 2, d: 1 };
      expect(isValidPieceGeometry(piece)).toBe(true);
    });

    it('accepts a valid triangular piece', () => {
      const piece = { x: 0, y: 0, w: 1, d: 1, corner: 'tl' };
      expect(isValidPieceGeometry(piece)).toBe(true);
    });

    it('rejects w=0', () => {
      const piece = { x: 0, y: 0, w: 0, d: 1 };
      expect(isValidPieceGeometry(piece)).toBe(false);
    });

    it('rejects d=0', () => {
      const piece = { x: 0, y: 0, w: 1, d: 0 };
      expect(isValidPieceGeometry(piece)).toBe(false);
    });

    it('rejects non-numeric x', () => {
      const piece = { x: 'not a number', y: 0, w: 2, d: 1 };
      expect(isValidPieceGeometry(piece)).toBe(false);
    });

    it('rejects non-finite x', () => {
      const piece = { x: Infinity, y: 0, w: 2, d: 1 };
      expect(isValidPieceGeometry(piece)).toBe(false);
    });

    it('rejects triangle with invalid corner', () => {
      const piece = { x: 0, y: 0, w: 1, d: 1, corner: 'invalid' };
      expect(isValidPieceGeometry(piece as any)).toBe(false);
    });

    it('accepts 2×1 triangle with corner (new in Phase 6)', () => {
      const piece = { x: 0, y: 0, w: 2, d: 1, corner: 'tl' };
      expect(isValidPieceGeometry(piece as any)).toBe(true);
    });

    it('accepts 1×2 triangle with corner (rotated 2×1)', () => {
      const piece = { x: 0, y: 0, w: 1, d: 2, corner: 'tl' };
      expect(isValidPieceGeometry(piece as any)).toBe(true);
    });

    it('rejects triangle with invalid dimensions', () => {
      const piece = { x: 0, y: 0, w: 2, d: 2, corner: 'tl' };
      expect(isValidPieceGeometry(piece as any)).toBe(false);
    });

    it('accepts pieces with negative x/y', () => {
      const piece = { x: -1, y: -0.5, w: 2, d: 1 };
      expect(isValidPieceGeometry(piece)).toBe(true);
    });

    it('accepts a valid quarter-circle piece', () => {
      const piece = { x: 0, y: 0, w: 1, d: 1, corner: 'tl', shape: 'viertelkreis' };
      expect(isValidPieceGeometry(piece)).toBe(true);
    });

    it('rejects quarter-circle without corner', () => {
      const piece = { x: 0, y: 0, w: 1, d: 1, shape: 'viertelkreis' };
      expect(isValidPieceGeometry(piece as any)).toBe(false);
    });

    it('rejects quarter-circle with invalid shape value', () => {
      const piece = { x: 0, y: 0, w: 1, d: 1, corner: 'tl', shape: 'kreis' };
      expect(isValidPieceGeometry(piece as any)).toBe(false);
    });
  });

  describe('id reservation', () => {
    beforeEach(() => {
      // Reset idCounter by reserving ID piece-0 (makes next id piece-1)
      reservePieceIds(['piece-0']);
    });

    it('reservePieceIds updates the counter', () => {
      reservePieceIds(['piece-100000']);
      const id = makePieceId();
      expect(id).toBe('piece-100001');
    });

    it('ignores non-matching IDs', () => {
      const startId = makePieceId();
      reservePieceIds(['not-a-piece-id', 'piece-abc']);
      const nextId = makePieceId();
      expect(nextId).not.toBe(startId); // should still increment from where it was
    });

    it('sanitizePieces calls reservePieceIds internally', () => {
      const pieces = [
        { id: 'piece-1', x: 0, y: 0, w: 2, d: 1 },
        { id: 'piece-100', x: 1, y: 0, w: 1, d: 1 },
      ];
      sanitizePieces(pieces as any[]);
      // After sanitizePieces, piece-100 should be reserved, so the next fresh id should be at least piece-101
      const newId = makePieceId();
      const match = /^piece-(\d+)$/.exec(newId);
      expect(match).toBeTruthy();
      if (match) {
        const num = Number(match[1]);
        expect(num).toBeGreaterThanOrEqual(101);
      }
    });
  });
});
