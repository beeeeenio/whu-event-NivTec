/**
 * Erkennt, ob ein localStorage-Fehler „Speicher voll“ bedeutet. Browser melden das unterschiedlich:
 * Chrome/Safari über `QuotaExceededError` (Code 22 bzw. 1014 bei Firefox-Altlasten), Firefox über
 * `NS_ERROR_DOM_QUOTA_REACHED`.
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, code } = err as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/** Verständlicher Hinweistext für einen fehlgeschlagenen automatischen Entwurf. */
export function describeStorageError(err: unknown): string {
  if (isQuotaExceededError(err)) {
    return 'Browserspeicher voll – der automatische Entwurf konnte nicht gesichert werden. Bitte „Plan-Datei herunterladen“ nutzen.';
  }
  return 'Automatisches Sichern nicht möglich (z. B. privater Modus). Bitte die Plan-Datei herunterladen.';
}
