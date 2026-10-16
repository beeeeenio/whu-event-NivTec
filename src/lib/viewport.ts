/** Sichtfenster des Plans in Metern (SVG-viewBox-Logik: Ursprung oben links, y nach unten). */
export interface ViewBox { x: number; y: number; w: number; h: number }

/** Kleinster Zoomfaktor (herausgezoomt, Plan 2× so groß wie der Ausgangsausschnitt). */
export const MIN_ZOOM = 0.5;
/** Größter Zoomfaktor (hineingezoomt, Ausschnitt ein Achtel der Ausgangsbreite). */
export const MAX_ZOOM = 8;

/** Aktueller Zoomfaktor relativ zum Ausgangsausschnitt (1 = unverändert, >1 = hineingezoomt). */
export function zoomLevel(view: ViewBox, base: ViewBox): number {
  return base.w / view.w;
}

/**
 * Zoomt um factor (>1 = hinein), wobei der Planpunkt focus an derselben Bildschirmstelle bleibt;
 * auf [MIN_ZOOM, MAX_ZOOM] geklemmt.
 */
export function zoomAt(view: ViewBox, base: ViewBox, factor: number, focus: { x: number; y: number }): ViewBox {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  const minW = base.w / MAX_ZOOM;
  const maxW = base.w / MIN_ZOOM;
  const newW = Math.min(maxW, Math.max(minW, view.w / factor));
  const s = newW / view.w;
  return {
    x: focus.x - (focus.x - view.x) * s,
    y: focus.y - (focus.y - view.y) * s,
    w: newW,
    h: view.h * s,
  };
}

/** Verschiebt den Ausschnitt um dxM/dyM Meter (Plan-Koordinaten). */
export function panBy(view: ViewBox, dxM: number, dyM: number): ViewBox {
  return { x: view.x + dxM, y: view.y + dyM, w: view.w, h: view.h };
}

/** Wert für das SVG-Attribut viewBox. */
export function viewBoxToString(v: ViewBox): string {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

/** Zoomfaktor einer Zwei-Finger-Geste: Verhältnis des Fingerabstands nachher zu vorher. */
export function pinchFactor(prevDistPx: number, nextDistPx: number): number {
  if (prevDistPx <= 0) return 1;
  return nextDistPx / prevDistPx;
}

/**
 * Was eine Touch-Geste auf dem Plan bedeutet:
 * 2 Finger = Zoom/Pan des Plans; 1 Finger auf Stück = Ziehen; 1 Finger auf leerer Fläche =
 * Seite scrollen (bzw. Plan verschieben, wenn hineingezoomt); bei bewaffnetem Werkzeug = Platzieren-Tippen
 * (also keine Geste, sondern ein Tippen, das der Editor selbst auswertet).
 */
export type TouchIntent = 'piece' | 'pinch' | 'page-scroll' | 'pan-view' | 'none';

export function touchGestureIntent(o: { touchCount: number; onPiece: boolean; armed: boolean; zoomed: boolean }): TouchIntent {
  if (o.touchCount >= 2) return 'pinch';
  if (o.touchCount <= 0) return 'none';
  if (o.armed) return 'none';
  if (o.onPiece) return 'piece';
  return o.zoomed ? 'pan-view' : 'page-scroll';
}
