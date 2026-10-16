import { describe, expect, it } from 'vitest';
import { describeStorageError, isQuotaExceededError } from '../storageErrors';

describe('isQuotaExceededError', () => {
  it('erkennt Quota-Fehler anhand von Name oder Code', () => {
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ code: 1014 })).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
  });

  it('liefert false für andere Fehler und Nicht-Fehler', () => {
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError(new Error('boom'))).toBe(false);
    expect(isQuotaExceededError('QuotaExceededError')).toBe(false);
  });
});

describe('describeStorageError', () => {
  it('liefert den Speicher-voll-Hinweis bei Quota-Fehlern', () => {
    expect(describeStorageError({ name: 'QuotaExceededError' })).toBe(
      'Browserspeicher voll – der automatische Entwurf konnte nicht gesichert werden. Bitte „Plan-Datei herunterladen“ nutzen.',
    );
  });

  it('liefert den allgemeinen Hinweis bei anderen Fehlern', () => {
    expect(describeStorageError(new Error('SecurityError'))).toBe(
      'Automatisches Sichern nicht möglich (z. B. privater Modus). Bitte die Plan-Datei herunterladen.',
    );
  });
});
