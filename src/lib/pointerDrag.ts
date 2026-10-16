import { dragThresholdPx } from './pointer';

/** Zustand einer Zeiger-Geste (Ziehen oder Klick) vom Druck bis zum Loslassen. */
export interface DragSession {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** true, sobald die Schwelle des Zeigertyps einmal überschritten wurde; danach bleibt es true. */
  moved: boolean;
}

export function startSession(e: { pointerId: number; pointerType: string; clientX: number; clientY: number }): DragSession {
  return {
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    moved: false,
  };
}

/** Aktualisiert die Sitzung (lastX/lastY = letzter Punkt); moved wird true, sobald die Schwelle (dragThresholdPx je Zeigertyp) einmal überschritten ist, und bleibt true. */
export function advanceSession(s: DragSession, e: { clientX: number; clientY: number }): DragSession {
  const movedNow = Math.hypot(e.clientX - s.startX, e.clientY - s.startY) >= dragThresholdPx(s.pointerType);
  return { ...s, lastX: e.clientX, lastY: e.clientY, moved: s.moved || movedNow };
}

/** Fasst häufige Updates auf höchstens eines je Frame zusammen; der letzte Wert gewinnt. */
export function createFrameThrottle<T>(
  apply: (v: T) => void,
  schedule: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
  cancelFrame: (h: number) => void = (h) => cancelAnimationFrame(h),
): { push(v: T): void; flush(): void; cancel(): void } {
  let pending: T | undefined;
  let hasPending = false;
  let scheduled = false;
  let handle = 0;

  function applyPending() {
    if (!hasPending) return;
    const v = pending as T;
    pending = undefined;
    hasPending = false;
    apply(v);
  }

  function fire() {
    scheduled = false;
    applyPending();
  }

  return {
    push(v: T) {
      pending = v;
      hasPending = true;
      if (!scheduled) {
        scheduled = true;
        handle = schedule(fire);
      }
    },
    // Wendet einen ausstehenden Wert sofort an und bricht den geplanten Frame ab.
    flush() {
      if (scheduled) {
        cancelFrame(handle);
        scheduled = false;
      }
      applyPending();
    },
    // Verwirft einen ausstehenden Wert und bricht den geplanten Frame ab.
    cancel() {
      if (scheduled) cancelFrame(handle);
      scheduled = false;
      pending = undefined;
      hasPending = false;
    },
  };
}
