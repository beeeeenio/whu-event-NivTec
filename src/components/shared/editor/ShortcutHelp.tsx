export function ShortcutHelp() {
  return (
    <details className="text-xs text-[var(--color-text-muted)]">
      <summary className="cursor-pointer select-none">Tastatur-Kurzbefehle</summary>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Klick</kbd> auf den Plan aktiviert die
          Tastatur
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">↑↓←→</kbd> Auswahl/Cursor um 0,5 m bewegen
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Umschalt</kbd>+
          <kbd className="rounded border border-[var(--color-border)] px-1">↑↓←→</kbd> um 1 m. Ohne Auswahl verschiebt Umschalt+←→ die ganze Fläche
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Enter</kbd> platzieren
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Alt</kbd> beim Ziehen – ohne Einrasten (Kollision wird rot)
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">R</kbd> drehen — auch schon während du
          ein Stück aus der Leiste ziehst, vor dem Loslassen
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Entf</kbd> entfernen
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Esc</kbd> bricht ab (auch während des Ziehens) / wählt ab
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">1</kbd>–
          <kbd className="rounded border border-[var(--color-border)] px-1">4</kbd> Plattengröße (Breite 2 / 1,5 / 1 / 0,5 m, Tiefe 1 m)
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">T</kbd> Dreieckpodest
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Z</kbd> Rückgängig
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+A</kbd> alles auswählen
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+D</kbd> Auswahl duplizieren – die Kopie wird ausgewählt; wirkt auch nach Klick auf die Leiste
        </li>
        <li>
          <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Umschalt+Z</kbd> oder
          <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Y</kbd> Wiederholen
        </li>
      </ul>
    </details>
  );
}
