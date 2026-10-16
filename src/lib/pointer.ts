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

/** Drehen per Mausrad: nie bei Strg (Trackpad-Pinch), höchstens einmal je Intervall. */
export function shouldRotateOnWheel(e: { ctrlKey: boolean }, nowMs: number, lastRotateMs: number | null, minIntervalMs = WHEEL_ROTATE_MIN_INTERVAL_MS): boolean {
  if (e.ctrlKey) return false;
  return lastRotateMs === null || nowMs - lastRotateMs >= minIntervalMs;
}
