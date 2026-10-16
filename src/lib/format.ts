/** Formatiert eine Meter-/Flächenangabe im deutschen Zahlenformat (Komma statt Punkt). */
export function formatMeters(v: number, digits = 2): string {
  return v.toFixed(digits).replace('.', ',');
}

/**
 * Liest eine Zahl aus einer Eingabe im deutschen oder englischen Format ('1,5' oder '1.5', Leerzeichen am Rand erlaubt).
 * Leer oder ungültig (z. B. 'abc', '1,2,3', 'Infinity') ergibt null.
 */
export function parseDecimalInput(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
