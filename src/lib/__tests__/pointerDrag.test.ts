import { describe, it, expect } from 'vitest';
import { advanceSession, createFrameThrottle, startSession } from '../pointerDrag';

describe('advanceSession', () => {
  it('bleibt bei Maus unter 4 px ohne Bewegung', () => {
    const s = startSession({ pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });
    const next = advanceSession(s, { clientX: 103, clientY: 100 });
    expect(next.moved).toBe(false);
  });

  it('wird bei Maus ab 5 px moved und bleibt es auch beim Zurückgehen', () => {
    const s = startSession({ pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });
    const far = advanceSession(s, { clientX: 105, clientY: 100 });
    expect(far.moved).toBe(true);
    const back = advanceSession(far, { clientX: 100, clientY: 100 });
    expect(back.moved).toBe(true);
  });

  it('braucht bei Touch 10 px', () => {
    const s = startSession({ pointerId: 2, pointerType: 'touch', clientX: 0, clientY: 0 });
    expect(advanceSession(s, { clientX: 6, clientY: 6 }).moved).toBe(false);
    expect(advanceSession(s, { clientX: 10, clientY: 0 }).moved).toBe(true);
  });

  it('aktualisiert lastX und lastY, Start bleibt erhalten', () => {
    const s = startSession({ pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 20 });
    const next = advanceSession(s, { clientX: 30, clientY: 45 });
    expect(next.lastX).toBe(30);
    expect(next.lastY).toBe(45);
    expect(next.startX).toBe(10);
    expect(next.startY).toBe(20);
    expect(next.pointerId).toBe(1);
  });
});

describe('createFrameThrottle', () => {
  function fakeFrames() {
    const callbacks: Array<() => void> = [];
    const cancelled: number[] = [];
    let nextHandle = 1;
    const handles = new Map<number, () => void>();
    return {
      schedule: (cb: () => void) => {
        const h = nextHandle++;
        callbacks.push(cb);
        handles.set(h, cb);
        return h;
      },
      cancel: (h: number) => {
        cancelled.push(h);
        handles.delete(h);
      },
      callbacks,
      cancelled,
      runFrame() {
        const pending = [...handles.values()];
        handles.clear();
        pending.forEach((cb) => cb());
      },
    };
  }

  it('wendet bei drei push im selben Frame nur den letzten Wert an', () => {
    const frames = fakeFrames();
    const applied: number[] = [];
    const t = createFrameThrottle<number>((v) => applied.push(v), frames.schedule, frames.cancel);
    t.push(1);
    t.push(2);
    t.push(3);
    expect(frames.callbacks).toHaveLength(1);
    frames.runFrame();
    expect(applied).toEqual([3]);
  });

  it('plant je Frame nur einen Callback und plant nach dem Frame neu', () => {
    const frames = fakeFrames();
    const applied: number[] = [];
    const t = createFrameThrottle<number>((v) => applied.push(v), frames.schedule, frames.cancel);
    t.push(1);
    frames.runFrame();
    t.push(2);
    frames.runFrame();
    expect(applied).toEqual([1, 2]);
  });

  it('flush wendet den ausstehenden Wert sofort an und bricht den Frame ab', () => {
    const frames = fakeFrames();
    const applied: number[] = [];
    const t = createFrameThrottle<number>((v) => applied.push(v), frames.schedule, frames.cancel);
    t.push(5);
    t.flush();
    expect(applied).toEqual([5]);
    expect(frames.cancelled).toHaveLength(1);
    frames.runFrame();
    expect(applied).toEqual([5]);
  });

  it('flush ohne ausstehenden Wert tut nichts', () => {
    const frames = fakeFrames();
    const applied: number[] = [];
    const t = createFrameThrottle<number>((v) => applied.push(v), frames.schedule, frames.cancel);
    t.flush();
    expect(applied).toEqual([]);
  });

  it('cancel verwirft den ausstehenden Wert', () => {
    const frames = fakeFrames();
    const applied: number[] = [];
    const t = createFrameThrottle<number>((v) => applied.push(v), frames.schedule, frames.cancel);
    t.push(7);
    t.cancel();
    frames.runFrame();
    expect(applied).toEqual([]);
    expect(frames.cancelled).toHaveLength(1);
  });
});
