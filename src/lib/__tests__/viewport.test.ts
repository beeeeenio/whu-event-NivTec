import { describe, it, expect } from 'vitest';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  zoomLevel,
  zoomAt,
  panBy,
  viewBoxToString,
  pinchFactor,
  touchGestureIntent,
  type ViewBox,
} from '../viewport';

const base: ViewBox = { x: 0, y: 0, w: 16, h: 10 };

describe('zoomLevel', () => {
  it('ist 1 für den Ausgangsausschnitt', () => {
    expect(zoomLevel(base, base)).toBe(1);
  });

  it('ist größer als 1, wenn hineingezoomt ist', () => {
    expect(zoomLevel({ x: 0, y: 0, w: 8, h: 5 }, base)).toBe(2);
  });
});

describe('zoomAt', () => {
  it('lässt den Fokuspunkt an derselben Bildschirmstelle (relative Position bleibt gleich)', () => {
    const focus = { x: 12, y: 3 };
    const view: ViewBox = { x: 2, y: 1, w: 10, h: 6.25 };
    const next = zoomAt(view, base, 1.5, focus);
    expect((focus.x - next.x) / next.w).toBeCloseTo((focus.x - view.x) / view.w, 10);
    expect((focus.y - next.y) / next.h).toBeCloseTo((focus.y - view.y) / view.h, 10);
  });

  it('zoomt hinein bei factor > 1 (w wird kleiner)', () => {
    const next = zoomAt(base, base, 2, { x: 8, y: 5 });
    expect(next.w).toBeCloseTo(8);
    expect(next.h).toBeCloseTo(5);
  });

  it('zoomt heraus bei factor < 1 (w wird größer)', () => {
    const next = zoomAt(base, base, 0.5, { x: 8, y: 5 });
    expect(next.w).toBeCloseTo(32);
  });

  it('klemmt auf MAX_ZOOM (kleinstes Fenster)', () => {
    const next = zoomAt(base, base, 1000, { x: 8, y: 5 });
    expect(next.w).toBeCloseTo(base.w / MAX_ZOOM);
    expect(zoomLevel(next, base)).toBeCloseTo(MAX_ZOOM);
  });

  it('klemmt auf MIN_ZOOM (größtes Fenster)', () => {
    const next = zoomAt(base, base, 0.0001, { x: 8, y: 5 });
    expect(next.w).toBeCloseTo(base.w / MIN_ZOOM);
    expect(zoomLevel(next, base)).toBeCloseTo(MIN_ZOOM);
  });

  it('hält das Seitenverhältnis', () => {
    const next = zoomAt(base, base, 3, { x: 4, y: 4 });
    expect(next.w / next.h).toBeCloseTo(base.w / base.h);
  });

  it('lässt das Fenster bei ungültigem Faktor unverändert', () => {
    expect(zoomAt(base, base, 0, { x: 1, y: 1 })).toEqual(base);
    expect(zoomAt(base, base, Number.NaN, { x: 1, y: 1 })).toEqual(base);
  });
});

describe('panBy', () => {
  it('verschiebt x und y um die Meterwerte und lässt die Größe unverändert', () => {
    const v: ViewBox = { x: 1, y: 2, w: 4, h: 3 };
    expect(panBy(v, 0.5, -1)).toEqual({ x: 1.5, y: 1, w: 4, h: 3 });
  });

  it('verschiebt nicht das Original', () => {
    const v: ViewBox = { x: 1, y: 2, w: 4, h: 3 };
    panBy(v, 1, 1);
    expect(v).toEqual({ x: 1, y: 2, w: 4, h: 3 });
  });
});

describe('viewBoxToString', () => {
  it('formatiert als "x y w h"', () => {
    expect(viewBoxToString({ x: 0, y: 1.5, w: 16, h: 10 })).toBe('0 1.5 16 10');
  });
});

describe('pinchFactor', () => {
  it('ist next/prev', () => {
    expect(pinchFactor(100, 150)).toBe(1.5);
    expect(pinchFactor(200, 100)).toBe(0.5);
  });

  it('liefert 1, wenn der vorherige Abstand 0 ist', () => {
    expect(pinchFactor(0, 150)).toBe(1);
  });

  it('liefert 1 bei negativem vorherigem Abstand', () => {
    expect(pinchFactor(-5, 150)).toBe(1);
  });
});

describe('touchGestureIntent', () => {
  it('2 Finger = pinch (unabhängig von Stück, Werkzeug und Zoom)', () => {
    expect(touchGestureIntent({ touchCount: 2, onPiece: false, armed: false, zoomed: false })).toBe('pinch');
    expect(touchGestureIntent({ touchCount: 2, onPiece: true, armed: false, zoomed: true })).toBe('pinch');
    expect(touchGestureIntent({ touchCount: 3, onPiece: false, armed: true, zoomed: false })).toBe('pinch');
  });

  it('1 Finger auf Stück = piece', () => {
    expect(touchGestureIntent({ touchCount: 1, onPiece: true, armed: false, zoomed: false })).toBe('piece');
    expect(touchGestureIntent({ touchCount: 1, onPiece: true, armed: false, zoomed: true })).toBe('piece');
  });

  it('1 Finger mit bewaffnetem Werkzeug = none (Platzieren-Tippen)', () => {
    expect(touchGestureIntent({ touchCount: 1, onPiece: false, armed: true, zoomed: false })).toBe('none');
    expect(touchGestureIntent({ touchCount: 1, onPiece: false, armed: true, zoomed: true })).toBe('none');
  });

  it('1 Finger auf leerer Fläche, nicht gezoomt = page-scroll', () => {
    expect(touchGestureIntent({ touchCount: 1, onPiece: false, armed: false, zoomed: false })).toBe('page-scroll');
  });

  it('1 Finger auf leerer Fläche, gezoomt = pan-view', () => {
    expect(touchGestureIntent({ touchCount: 1, onPiece: false, armed: false, zoomed: true })).toBe('pan-view');
  });

  it('kein Finger = none', () => {
    expect(touchGestureIntent({ touchCount: 0, onPiece: false, armed: false, zoomed: false })).toBe('none');
  });
});
