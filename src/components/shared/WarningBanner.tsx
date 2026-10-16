import type { ReactNode } from 'react';

interface Props {
  tone?: 'info' | 'warning';
  /** Optional: zeigt rechts einen Button „Ausblenden“. */
  onDismiss?: () => void;
  children: ReactNode;
}

export function WarningBanner({ tone = 'warning', onDismiss, children }: Props) {
  const color = tone === 'warning' ? 'var(--color-warning)' : 'var(--color-accent)';
  const style = { borderColor: color, color, backgroundColor: 'color-mix(in srgb, ' + color + ' 12%, transparent)' };
  if (!onDismiss) {
    return (
      <div className="rounded-md border px-3 py-2 text-sm" style={style}>
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm" style={style}>
      <div>{children}</div>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs underline">
        Ausblenden
      </button>
    </div>
  );
}
