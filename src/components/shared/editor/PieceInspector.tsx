import { useId, useState } from 'react';
import { parseDecimalInput } from '../../../lib/format';
import { RECT_CATALOG, TRIANGLE_PANEL_SIZE_M } from '../../../domain/panels';
import type { PieceEdit, PieceTypeChoice } from '../../../domain/pieceOps';
import type { Piece2D } from '../../../domain/customShape';
import { ACTION_BTN } from './styles';

/** Eine Auswahl im Typ-Menü: eindeutiger Schlüssel, Beschriftung und die Änderung, die sie auslöst. */
interface TypeOption {
  key: string;
  label: string;
  choice: PieceTypeChoice;
}

/** Zahl ohne überflüssige Nullen, im deutschen Format (Komma), für Eingabefelder und Beschriftungen. */
function fmt(v: number): string {
  return String(Number(v.toFixed(3))).replace('.', ',');
}

const NUMBER_ERROR = 'Bitte eine Zahl in Metern eingeben, z. B. 1,5.';

const TYPE_OPTIONS: TypeOption[] = [
  ...RECT_CATALOG.map((e) => ({ key: `rect:${e.w}:${e.d}`, label: `Podest ${fmt(e.w)}×${fmt(e.d)} m`, choice: { kind: 'rect' as const, w: e.w, d: e.d } })),
  { key: `tri:${TRIANGLE_PANEL_SIZE_M}:${TRIANGLE_PANEL_SIZE_M}`, label: 'Dreieck 1×1 m', choice: { kind: 'triangle', w: 1, d: 1 } },
  { key: 'tri:2:1', label: 'Dreieck 2×1 m', choice: { kind: 'triangle', w: 2, d: 1 } },
  { key: 'quarter', label: 'Viertelkreis R 1 m', choice: { kind: 'viertelkreis' } },
];

/** Schlüssel des aktuellen Typs; Maße in beiden Ausrichtungen gesucht (ein gedrehtes Stück gehört zum selben Typ). null, wenn kein Katalogtyp passt. */
function currentTypeKey(p: Piece2D): string | null {
  if (p.shape === 'viertelkreis') return 'quarter';
  const kind = p.corner !== undefined ? 'tri' : 'rect';
  const keys = new Set(TYPE_OPTIONS.map((o) => o.key));
  for (const [w, d] of [
    [p.w, p.d],
    [p.d, p.w],
  ]) {
    const k = `${kind}:${w}:${d}`;
    if (keys.has(k)) return k;
  }
  return null;
}

/**
 * Positions-Inspector für ein ausgewähltes Stück: X/Y in Metern, Typ und Drehen.
 * Werte werden bei Enter oder beim Verlassen des Feldes übernommen; die Prüfung macht der Aufrufer (onApply) und liefert eine Fehlermeldung oder null.
 */
export function PieceInspector({ piece, onApply, onRotate }: { piece: Piece2D; onApply: (edit: PieceEdit) => string | null; onRotate: () => void }) {
  const xId = useId();
  const yId = useId();
  const typeId = useId();
  const [xText, setXText] = useState(() => fmt(piece.x));
  const [yText, setYText] = useState(() => fmt(piece.y));
  const [error, setError] = useState<string | null>(null);

  // Bei anderem Stück oder geänderter Position (Ziehen, Drehen, Undo) die Eingabefelder neu füllen.
  // Während des Renderns angepasst statt per Effect, damit kein zweiter Render nötig ist.
  const sig = `${piece.id}|${piece.x}|${piece.y}`;
  const [seenSig, setSeenSig] = useState(sig);
  if (seenSig !== sig) {
    setSeenSig(sig);
    setXText(fmt(piece.x));
    setYText(fmt(piece.y));
    setError(null);
  }

  function commit(axis: 'x' | 'y') {
    const text = axis === 'x' ? xText : yText;
    const v = parseDecimalInput(text);
    if (v === null) {
      setError(NUMBER_ERROR);
      return;
    }
    setError(onApply({ [axis]: v }));
  }

  function chooseType(key: string) {
    const opt = TYPE_OPTIONS.find((o) => o.key === key);
    if (!opt) return;
    // Gleiche Maße und Form: nichts zu tun.
    if (key === currentTypeKey(piece)) return;
    setError(onApply({ type: opt.choice }));
  }

  const typeKey = currentTypeKey(piece);
  const fieldClass = 'w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm tabular-nums text-[var(--color-text)]';

  return (
    <fieldset className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
      <legend className="px-1 text-xs text-[var(--color-text-muted)]">Position & Typ</legend>
      <div className="flex flex-col gap-1">
        <label htmlFor={xId} className="text-xs text-[var(--color-text-muted)]">
          X (m)
        </label>
        <input
          id={xId}
          type="text"
          inputMode="decimal"
          value={xText}
          onChange={(e) => setXText(e.target.value)}
          onBlur={() => commit('x')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit('x');
          }}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={yId} className="text-xs text-[var(--color-text-muted)]">
          Y (m)
        </label>
        <input
          id={yId}
          type="text"
          inputMode="decimal"
          value={yText}
          onChange={(e) => setYText(e.target.value)}
          onBlur={() => commit('y')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit('y');
          }}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={typeId} className="text-xs text-[var(--color-text-muted)]">
          Typ
        </label>
        <select
          id={typeId}
          value={typeKey ?? ''}
          onChange={(e) => chooseType(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
        >
          {typeKey === null && (
            <option value="" disabled>
              Anderer Typ
            </option>
          )}
          {TYPE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button type="button" onClick={onRotate} className={ACTION_BTN}>
        ⤾ 90° drehen
      </button>
      {error && (
        <p role="alert" className="w-full text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}
