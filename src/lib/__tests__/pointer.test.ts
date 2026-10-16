import { describe, it, expect } from 'vitest';
import { dragThresholdPx, isPrimaryButton, shouldRotateOnWheel, wheelIntent, WHEEL_ROTATE_MIN_INTERVAL_MS } from '../pointer';

describe('dragThresholdPx', () => {
  it('gibt für Touch 10 px zurück', () => {
    expect(dragThresholdPx('touch')).toBe(10);
  });

  it('gibt für Stift 6 px zurück', () => {
    expect(dragThresholdPx('pen')).toBe(6);
  });

  it('gibt für Maus 4 px zurück', () => {
    expect(dragThresholdPx('mouse')).toBe(4);
  });

  it('fällt bei unbekanntem Zeigertyp auf 4 px zurück', () => {
    expect(dragThresholdPx('')).toBe(4);
  });
});

describe('isPrimaryButton', () => {
  it('erkennt die primäre Taste (button 0)', () => {
    expect(isPrimaryButton({ button: 0 })).toBe(true);
  });

  it('weist die mittlere Taste (button 1) ab', () => {
    expect(isPrimaryButton({ button: 1 })).toBe(false);
  });

  it('weist die rechte Taste (button 2) ab', () => {
    expect(isPrimaryButton({ button: 2 })).toBe(false);
  });
});

describe('shouldRotateOnWheel', () => {
  it('dreht nie bei gedrückter Strg-Taste (Trackpad-Pinch)', () => {
    expect(shouldRotateOnWheel({ ctrlKey: true }, 1000, null)).toBe(false);
  });

  it('dreht beim ersten Wheel-Ereignis ohne vorherige Drehung', () => {
    expect(shouldRotateOnWheel({ ctrlKey: false }, 1000, null)).toBe(true);
  });

  it('dreht nicht innerhalb des Standard-Intervalls (200 ms seit letzter Drehung)', () => {
    expect(shouldRotateOnWheel({ ctrlKey: false }, 1200, 1000)).toBe(false);
  });

  it('dreht wieder nach Ablauf des Standard-Intervalls (300 ms seit letzter Drehung)', () => {
    expect(shouldRotateOnWheel({ ctrlKey: false }, 1300, 1000)).toBe(true);
  });

  it('respektiert ein eigenes minIntervalMs', () => {
    expect(shouldRotateOnWheel({ ctrlKey: false }, 1100, 1000, 100)).toBe(true);
  });

  it('nutzt als Standardintervall WHEEL_ROTATE_MIN_INTERVAL_MS', () => {
    expect(WHEEL_ROTATE_MIN_INTERVAL_MS).toBe(300);
  });

  it('dreht nie bei Cmd (metaKey)', () => {
    expect(shouldRotateOnWheel({ ctrlKey: false, metaKey: true }, 1000, null)).toBe(false);
  });

  it('dreht bei metaKey false wie ohne metaKey', () => {
    expect(shouldRotateOnWheel({ ctrlKey: false, metaKey: false }, 1000, null)).toBe(true);
    expect(shouldRotateOnWheel({ ctrlKey: false, metaKey: false }, 1200, 1000)).toBe(false);
  });
});

describe('wheelIntent', () => {
  const idle = { paletteDragging: false };
  const dragging = { paletteDragging: true };

  it('reines Rad scrollt die Seite', () => {
    expect(wheelIntent({ ctrlKey: false, metaKey: false }, idle)).toBe('scroll');
  });

  it('Strg+Rad zoomt den Plan', () => {
    expect(wheelIntent({ ctrlKey: true, metaKey: false }, idle)).toBe('zoom');
  });

  it('Cmd+Rad zoomt den Plan', () => {
    expect(wheelIntent({ ctrlKey: false, metaKey: true }, idle)).toBe('zoom');
  });

  it('reines Rad dreht das Stück während des Palette-Ziehens', () => {
    expect(wheelIntent({ ctrlKey: false, metaKey: false }, dragging)).toBe('rotate');
  });

  it('Strg+Rad wird während des Palette-Ziehens verworfen', () => {
    expect(wheelIntent({ ctrlKey: true, metaKey: false }, dragging)).toBe('ignore');
  });

  it('Cmd+Rad wird während des Palette-Ziehens verworfen', () => {
    expect(wheelIntent({ ctrlKey: false, metaKey: true }, dragging)).toBe('ignore');
  });
});
