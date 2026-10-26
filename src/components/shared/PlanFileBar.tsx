import { useRef, useState } from 'react';
import { downloadTextFile } from '../../lib/download';
import type { PlanKind } from '../../domain/migrations';
import { buildShareUrl, encodePlanToken, SHARE_URL_WARN_LENGTH } from '../../lib/planShare';

interface Props {
  namespace: string;
  /** Vorschlag für den Dateinamen (z. B. Name des Tisches); ohne Angabe nivtec-<namespace>. */
  fileBase?: string;
  currentData: unknown;
  onLoad: (data: unknown) => string | null;
  /** Import-Bericht des letzten Ladens (z. B. verworfene Stücke) — optional. */
  warnings?: string[];
  /** Gesetzt: "Link teilen" erscheint und kodiert currentData für diese Plan-Art in den URL-Hash. */
  shareKind?: PlanKind;
}

const ACTION_CLASS =
  'px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]';

export function PlanFileBar({ namespace, fileBase, currentData, onLoad, warnings, shareKind }: Props) {
  const [importError, setImportError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const defaultName = fileBase?.trim() || `nivtec-${namespace}`;

  function confirmDownload() {
    if (fileName === null) return;
    // Verbotene Dateinamen-Zeichen entfernen, ".json" nur anhängen, wenn es noch fehlt.
    const base = fileName.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\.json$/i, '') || defaultName;
    downloadTextFile(`${base}.json`, JSON.stringify(currentData, null, 2), 'application/json;charset=utf-8');
    setFileName(null);
  }

  async function handleShare() {
    if (!shareKind) return;
    setShareError(null);
    try {
      const token = await encodePlanToken(shareKind, currentData);
      const url = buildShareUrl(location.href, token);
      // Kopieren kann am Browser oder an fehlender Berechtigung scheitern — dann bleibt der Link sichtbar zum Markieren.
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }
      setShareUrl(url);
      setShareCopied(copied);
    } catch {
      setShareUrl(null);
      setShareError('Der Link konnte nicht erzeugt werden.');
    }
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
      <button type="button" onClick={() => fileInputRef.current?.click()} className={ACTION_CLASS}>
        Plan-Datei öffnen
      </button>
      {fileName === null ? (
        <button type="button" onClick={() => setFileName(defaultName)} className={ACTION_CLASS}>
          Plan-Datei herunterladen
        </button>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            confirmDownload();
          }}
        >
          <label className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
            Dateiname
            <input
              autoFocus
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFileName(null);
              }}
              aria-label="Dateiname für den Plan"
              className="w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            />
            <span className="text-xs text-[var(--color-text-muted)]">.json</span>
          </label>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
          >
            Herunterladen
          </button>
          <button type="button" onClick={() => setFileName(null)} className="text-xs text-[var(--color-text-muted)] underline">
            Abbrechen
          </button>
        </form>
      )}
      {shareKind && (
        <button type="button" onClick={() => void handleShare()} className={ACTION_CLASS}>
          Link teilen
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileChange} className="hidden" />
      <span className="text-xs text-[var(--color-text-muted)]">JSON, z.B. für die Hallenplanung</span>
      {importError && <p className="text-xs text-[var(--color-danger)]">{importError}</p>}
      {!importError && warnings && warnings.length > 0 && (
        <p className="text-xs text-[var(--color-accent)]">Import-Hinweis: {warnings.join(' ')}</p>
      )}
      {shareError && <p className="w-full text-xs text-[var(--color-danger)]">{shareError}</p>}
      {shareUrl && (
        <div className="w-full space-y-1.5">
          {shareCopied ? (
            <p className="text-xs text-[var(--color-accent)]">Link kopiert – wer ihn öffnet, sieht den Plan nur lesend.</p>
          ) : (
            <>
              <p className="text-xs text-[var(--color-text-muted)]">
                Kopieren hat nicht geklappt. Link zum Markieren und Kopieren – wer ihn öffnet, sieht den Plan nur lesend.
              </p>
              <input
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Teilen-Link"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
              />
            </>
          )}
          {shareUrl.length > SHARE_URL_WARN_LENGTH && (
            <p className="text-xs text-[var(--color-warning)]">
              Der Link ist sehr lang – manche Programme kürzen ihn. Sicherer ist die Plan-Datei.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
