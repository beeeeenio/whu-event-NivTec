import { useRef, useState } from 'react';
import { downloadTextFile } from '../../lib/download';

interface Props {
  namespace: string;
  currentData: unknown;
  onLoad: (data: unknown) => string | null;
  /** Import-Bericht des letzten Ladens (z. B. verworfene Stücke) — optional. */
  warnings?: string[];
}

export function PlanFileBar({ namespace, currentData, onLoad, warnings }: Props) {
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleExportFile() {
    downloadTextFile(`nivtec-${namespace}.json`, JSON.stringify(currentData, null, 2), 'application/json;charset=utf-8');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // dieselbe Datei muss sich später erneut auswählen lassen
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setImportError(onLoad(parsed));
    } catch {
      setImportError('Datei konnte nicht gelesen werden — ist es eine gültige NivTec-JSON-Datei?');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
      >
        Plan-Datei öffnen
      </button>
      <button
        type="button"
        onClick={handleExportFile}
        className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
      >
        Plan-Datei herunterladen
      </button>
      <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileChange} className="hidden" />
      <span className="text-xs text-[var(--color-text-muted)]">JSON, z.B. für die Hallenplanung</span>
      {importError && <p className="text-xs text-[var(--color-danger)]">{importError}</p>}
      {!importError && warnings && warnings.length > 0 && (
        <p className="text-xs text-[var(--color-accent)]">Import-Hinweis: {warnings.join(' ')}</p>
      )}
    </div>
  );
}
