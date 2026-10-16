import { describe, expect, it } from 'vitest';
import { findFreePosition, fitsAt, type Piece2D } from '../customShape';
import {
  isRoomBlockerId,
  nextObstacleId,
  obstaclesOverlapping,
  piecesOutsideRoom,
  rectInsideRoom,
  roomBlockers,
  sanitizeRoom,
  type RoomPlan,
} from '../room';

function piece(id: string, x: number, y: number, w: number, d: number): Piece2D {
  return { id, x, y, w, d };
}

/** Raum 5 × 4 m mit einer Säule bei (1,1) und 1 m × 1 m. */
const room: RoomPlan = {
  widthM: 5,
  depthM: 4,
  obstacles: [{ id: 'ob-1', kind: 'saeule', x: 1, y: 1, w: 1, d: 1 }],
};

describe('room', () => {
  describe('roomBlockers', () => {
    it('liefert [] ohne Raum', () => {
      expect(roomBlockers(undefined)).toEqual([]);
    });

    it('macht Säulen und den Außenbereich rechts und hinten belegt', () => {
      const blockers = roomBlockers(room);
      expect(blockers).toEqual([
        { id: 'room:ob-1', x: 1, y: 1, w: 1, d: 1 },
        { id: 'room:__rechts', x: 5, y: 0, w: 1000, d: 1004 },
        { id: 'room:__hinten', x: 0, y: 4, w: 5, d: 1000 },
      ]);
      expect(blockers.every((b) => isRoomBlockerId(b.id))).toBe(true);
    });

    it('macht eine Säule für fitsAt belegt, freie Fläche nicht', () => {
      const blockers = roomBlockers(room);
      expect(fitsAt(blockers, 1, 1, 1, 1)).toBe(false);
      expect(fitsAt(blockers, 0, 0, 1, 1)).toBe(true);
      // Berühren ist kein Überlappen
      expect(fitsAt(blockers, 2, 1, 1, 1)).toBe(true);
    });

    it('macht Flächen außerhalb von widthM und depthM für fitsAt belegt', () => {
      const blockers = roomBlockers(room);
      expect(fitsAt(blockers, 4.5, 0, 1, 1)).toBe(false);
      expect(fitsAt(blockers, 4, 0, 1, 1)).toBe(true);
      expect(fitsAt(blockers, 0, 3.5, 1, 1)).toBe(false);
      expect(fitsAt(blockers, 0, 3, 1, 1)).toBe(true);
    });

    it('lässt findFreePosition einer Säule ausweichen', () => {
      const blockers = roomBlockers(room);
      const pos = findFreePosition(blockers, 1, 1, 1, 1);
      expect(pos).not.toEqual({ x: 1, y: 1 });
      expect(fitsAt(blockers, pos.x, pos.y, 1, 1)).toBe(true);
      expect(rectInsideRoom({ ...pos, w: 1, d: 1 }, room)).toBe(true);
    });

    it('zeigt in einem vollen Raum eine Lage außerhalb (Sicherheitsnetz)', () => {
      const full: RoomPlan = { widthM: 2, depthM: 2, obstacles: [] };
      const existing = [...roomBlockers(full), piece('p-1', 0, 0, 2, 2)];
      const pos = findFreePosition(existing, 1, 1, 0, 0);
      expect(rectInsideRoom({ ...pos, w: 1, d: 1 }, full)).toBe(false);
    });
  });

  describe('rectInsideRoom', () => {
    it('ist immer true ohne Raum', () => {
      expect(rectInsideRoom({ x: 100, y: 100, w: 5, d: 5 }, undefined)).toBe(true);
    });

    it('prüft vollständige Lage im Raum', () => {
      expect(rectInsideRoom({ x: 0, y: 0, w: 5, d: 4 }, room)).toBe(true);
      expect(rectInsideRoom({ x: 4, y: 3, w: 1, d: 1 }, room)).toBe(true);
      expect(rectInsideRoom({ x: 4.5, y: 0, w: 1, d: 1 }, room)).toBe(false);
      expect(rectInsideRoom({ x: 0, y: 3.5, w: 1, d: 1 }, room)).toBe(false);
      expect(rectInsideRoom({ x: -0.5, y: 0, w: 1, d: 1 }, room)).toBe(false);
    });
  });

  describe('obstaclesOverlapping', () => {
    it('findet Hindernisse, die ein Stück überschneiden', () => {
      const hits = obstaclesOverlapping([piece('p-1', 0.5, 0.5, 1, 1)], room);
      expect(hits.map((o) => o.id)).toEqual(['ob-1']);
    });

    it('ignoriert Berührungen und ist ohne Raum leer', () => {
      expect(obstaclesOverlapping([piece('p-1', 2, 1, 1, 1)], room)).toEqual([]);
      expect(obstaclesOverlapping([piece('p-1', 1, 1, 1, 1)], undefined)).toEqual([]);
    });
  });

  describe('piecesOutsideRoom', () => {
    it('liefert Stücke, die nicht vollständig im Raum liegen', () => {
      const pieces = [piece('inside', 0, 0, 2, 2), piece('partly', 4.5, 0, 1, 1), piece('neg', -0.5, 0, 1, 1)];
      expect(piecesOutsideRoom(pieces, room).map((p) => p.id)).toEqual(['partly', 'neg']);
    });

    it('ist ohne Raum leer', () => {
      expect(piecesOutsideRoom([piece('p-1', 100, 100, 1, 1)], undefined)).toEqual([]);
    });
  });

  describe('sanitizeRoom', () => {
    it('übernimmt einen gültigen Raum unverändert', () => {
      const result = sanitizeRoom(room);
      expect(result).toEqual({ room, dropped: 0 });
    });

    it('verwirft Räume mit ungültigen Maßen', () => {
      expect(sanitizeRoom({ widthM: 0, depthM: 4, obstacles: [] })).toEqual({ room: undefined, dropped: 0 });
      expect(sanitizeRoom({ widthM: 5, depthM: 501, obstacles: [] })).toEqual({ room: undefined, dropped: 0 });
      expect(sanitizeRoom({ widthM: 'fünf', depthM: 4, obstacles: [] })).toEqual({ room: undefined, dropped: 0 });
      expect(sanitizeRoom(null)).toEqual({ room: undefined, dropped: 0 });
    });

    it('verwirft ungültige Hindernisse und zählt sie', () => {
      const result = sanitizeRoom({
        widthM: 5,
        depthM: 4,
        obstacles: [
          { id: 'ob-1', kind: 'saeule', x: 1, y: 1, w: 1, d: 1 },
          { id: 'ob-2', kind: 'unbekannt', x: 1, y: 1, w: 1, d: 1 },
          { id: 'ob-3', kind: 'tuer', x: 1, y: 1, w: 0, d: 1 },
          { id: 'ob-4', kind: 'tuer', x: -1, y: 1, w: 1, d: 1 },
          { id: '', kind: 'tuer', x: 1, y: 1, w: 1, d: 1 },
          { id: 'ob-5', kind: 'tuer', x: Infinity, y: 1, w: 1, d: 1 },
          'kein Objekt',
        ],
      });
      expect(result.dropped).toBe(6);
      expect(result.room?.obstacles.map((o) => o.id)).toEqual(['ob-1']);
    });

    it('verwirft doppelte IDs, ohne umzubenennen', () => {
      const result = sanitizeRoom({
        widthM: 5,
        depthM: 4,
        obstacles: [
          { id: 'ob-1', kind: 'saeule', x: 1, y: 1, w: 1, d: 1 },
          { id: 'ob-1', kind: 'tuer', x: 3, y: 0, w: 1, d: 1 },
        ],
      });
      expect(result.dropped).toBe(1);
      expect(result.room?.obstacles).toEqual([{ id: 'ob-1', kind: 'saeule', x: 1, y: 1, w: 1, d: 1 }]);
    });

    it('lässt ein zu langes Label weg, behält aber das Hindernis', () => {
      const result = sanitizeRoom({
        widthM: 5,
        depthM: 4,
        obstacles: [
          { id: 'ob-1', kind: 'notausgang', x: 0, y: 0, w: 1, d: 1, label: 'Nord' },
          { id: 'ob-2', kind: 'notausgang', x: 2, y: 0, w: 1, d: 1, label: 'x'.repeat(81) },
        ],
      });
      expect(result.dropped).toBe(0);
      expect(result.room?.obstacles[0].label).toBe('Nord');
      expect(result.room?.obstacles[1].label).toBeUndefined();
      expect(result.room?.obstacles).toHaveLength(2);
    });

    it('behandelt fehlende Hindernisse als leere Liste', () => {
      expect(sanitizeRoom({ widthM: 5, depthM: 4 })).toEqual({
        room: { widthM: 5, depthM: 4, obstacles: [] },
        dropped: 0,
      });
    });
  });

  describe('nextObstacleId', () => {
    it('vergibt ob-1 in einem leeren Raum', () => {
      expect(nextObstacleId({ widthM: 5, depthM: 4, obstacles: [] })).toBe('ob-1');
    });

    it('vergibt die kleinste freie Nummer', () => {
      expect(nextObstacleId(room)).toBe('ob-2');
      const gap: RoomPlan = {
        widthM: 5,
        depthM: 4,
        obstacles: [
          { id: 'ob-1', kind: 'saeule', x: 0, y: 0, w: 1, d: 1 },
          { id: 'ob-3', kind: 'saeule', x: 2, y: 0, w: 1, d: 1 },
        ],
      };
      expect(nextObstacleId(gap)).toBe('ob-2');
    });
  });
});
