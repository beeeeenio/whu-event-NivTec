import { useState } from 'react';

/** Kleines Namensfeld: Enter übernimmt, Esc bricht ab. */
export function NameInput({
  initial,
  label,
  confirmLabel = 'OK',
  onConfirm,
  onCancel,
}: {
  initial: string;
  label: string;
  confirmLabel?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(value);
      }}
    >
      <input
        autoFocus
        type="text"
        value={value}
        maxLength={80}
        aria-label={label}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        className="w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
      />
      <button
        type="submit"
        className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-2.5 py-1 text-sm text-[var(--color-accent-contrast)]"
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-[var(--color-text-muted)] underline">
        Abbrechen
      </button>
    </form>
  );
}
