/** Bewegungsschwelle in Bildschirm-px, ab der ein Zeigerdruck als Ziehen gilt. */
export function dragThresholdPx(pointerType: string): number {
  if (pointerType === 'touch') return 10;
  if (pointerType === 'pen') return 6;
  return 4;
}

/** Nur die primäre Taste (links bzw. Finger/Stift) startet ein Ziehen. */
export function isPrimaryButton(e: { button: number }): boolean {
  return e.button === 0;
}

export const WHEEL_ROTATE_MIN_INTERVAL_MS = 300;

/** Drehen per Mausrad: nie bei Strg/Cmd (Trackpad-Pinch, Zoom), höchstens einmal je Intervall. */
export function shouldRotateOnWheel(e: { ctrlKey: boolean; metaKey?: boolean }, nowMs: number, lastRotateMs: number | null, minIntervalMs = WHEEL_ROTATE_MIN_INTERVAL_MS): boolean {
  if (e.ctrlKey || e.metaKey) return false;
  return lastRotateMs === null || nowMs - lastRotateMs >= minIntervalMs;
}

export type WheelIntent = 'rotate' | 'zoom' | 'scroll' | 'ignore';

/**
 * Belegung des Mausrads: Während des Palette-Ziehens dreht das reine Rad das Stück; Strg/Cmd+Rad wird
 * dann verworfen (kein Zoom während des Ziehens, viewBox bleibt stabil). Sonst zoomt Strg/Cmd+Rad
 * (inkl. Trackpad-Pinch) den Plan, das reine Rad scrollt die Seite.
 */
export function wheelIntent(e: { ctrlKey: boolean; metaKey: boolean }, ctx: { paletteDragging: boolean }): WheelIntent {
  const modifier = e.ctrlKey || e.metaKey;
  if (ctx.paletteDragging) return modifier ? 'ignore' : 'rotate';
  return modifier ? 'zoom' : 'scroll';
}
