import type { Piece2D } from '../../domain/customShape';
import { useState } from 'react';
import {
  forexKey,
  forexPrintGroups,
  freeEdges,
  FRONT_PRINT_GROUP,
  type ForexPrintGroup,
  type PlacedForexPanel,
} from '../../domain/forex';
import { quarterCirclePath, trianglePoints } from '../../domain/triangle';
import type { ForexPanel, ForexSide } from '../../domain/types';

interface Props {
  /** Stücke in normalisierten Plan-Koordinaten (wie für Grundriss/3D). */
  pieces: Piece2D[];
  forexPanels: ForexPanel[];
  /** Aktive Blenden mit ihrer Kante (für Druckgruppen und Längen). */
  placed: PlacedForexPanel[];
  /** Druckbilder je ForexPanel.id. */
  prints: Record<string, string>;
  onToggle: (pieceId: string, side: ForexSide) => void;
  onAllFrontEdges: () => void;
  onClear: () => void;
  /** Ein Bild über die Platten einer Druckgruppe verteilen. */
  onUploadPrint: (group: ForexPrintGroup, file: File) => Promise<void>;
  onRemovePrint: (group: ForexPrintGroup) => void;
  /** Druckgruppe einer Platte setzen; undefined = eigener Druck, '__new' = neue Gruppe. */
  onSetPrintGroup: (panelId: string, printGroup: string | undefined) => void;
}

const SIDE_LABELS: Record<ForexSide, string> = {
  top: 'Hinterkante',
  bottom: 'Vorderkante',
  left: 'linke Kante',
  right: 'rechte Kante',
  hyp: 'Schräge',
};

/**
 * Grundriss nur für die Forex-Blenden: an jeder freien Außenkante ein Schalter „Forex“.
 * Kanten, an denen ein Nachbarpodest anliegt, bekommen keinen Schalter.
 */
function groupLabel(key: string): string {
  return key === FRONT_PRINT_GROUP ? 'Vorderkante' : key;
}

export function ForexEdgeEditor({
  pieces,
  forexPanels,
  placed,
  prints,
  onToggle,
  onAllFrontEdges,
  onClear,
  onUploadPrint,
  onRemovePrint,
  onSetPrintGroup,
}: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  if (pieces.length === 0) return null;

  const pieceNo = (pieceId: string) => pieces.findIndex((p) => p.id === pieceId) + 1;
  const groups = forexPrintGroups(placed);
  const groupNames = Array.from(new Set(forexPanels.map((p) => p.printGroup).filter((g): g is string => !!g)));

  async function handleUpload(group: ForexPrintGroup, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // dieselbe Datei muss sich erneut auswählen lassen
    if (!file) return;
    setUploadError(null);
    setBusyKey(group.key);
    try {
      await onUploadPrint(group, file);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  const edges = freeEdges(pieces);
  const active = new Set(forexPanels.map((p) => forexKey(p.pieceId, p.side)));
  const activeCount = edges.filter((e) => active.has(forexKey(e.pieceId, e.side))).length;

  const maxX = Math.max(...pieces.map((p) => p.x + p.w));
  const maxY = Math.max(...pieces.map((p) => p.y + p.d));
  const pad = 0.7;
  const pillW = 0.62;
  const pillH = 0.24;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAllFrontEdges}
          className="px-3 py-1.5 rounded-md text-sm border bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]"
        >
          Alle Vorderkanten
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={activeCount === 0}
          className="px-3 py-1.5 rounded-md text-sm border bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-danger)] disabled:opacity-50"
        >
          Alle entfernen
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">
          {activeCount} von {edges.length} freien Außenkanten mit Forex-Blende
        </span>
      </div>
      <svg
        viewBox={`${-pad} ${-pad} ${maxX + pad * 2} ${maxY + pad * 2}`}
        className="w-full h-auto max-h-[360px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
        role="group"
        aria-label="Forex-Blenden je Außenkante"
      >
        {pieces.map((p) =>
          p.corner === undefined ? (
            <rect key={p.id} x={p.x} y={p.y} width={p.w} height={p.d} fill="var(--color-panel-fill)" stroke="var(--color-panel-stroke)" strokeWidth={0.02} />
          ) : p.shape === 'viertelkreis' ? (
            <path key={p.id} d={quarterCirclePath(p, p.corner)} fill="var(--color-panel-fill)" stroke="var(--color-panel-stroke)" strokeWidth={0.02} />
          ) : (
            <polygon
              key={p.id}
              points={trianglePoints(p, p.corner).map((pt) => `${pt.x},${pt.y}`).join(' ')}
              fill="var(--color-panel-fill)"
              stroke="var(--color-panel-stroke)"
              strokeWidth={0.02}
            />
          ),
        )}
        {edges.map((e) => {
          const key = forexKey(e.pieceId, e.side);
          const on = active.has(key);
          const mx = (e.x1 + e.x2) / 2 + e.nx * 0.2;
          const my = (e.y1 + e.y2) / 2 + e.ny * 0.2;
          const label = `Forex an ${SIDE_LABELS[e.side]} (${(Math.round(e.lengthM * 100) / 100).toString().replace('.', ',')} m)`;
          const toggle = () => onToggle(e.pieceId, e.side);
          return (
            <g
              key={key}
              role="switch"
              aria-checked={on}
              aria-label={label}
              tabIndex={0}
              onClick={toggle}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  toggle();
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>{label}</title>
              <line
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={on ? 'var(--color-accent)' : 'var(--color-grid-line)'}
                strokeWidth={on ? 0.08 : 0.04}
                strokeLinecap="round"
              />
              <rect
                x={mx - pillW / 2}
                y={my - pillH / 2}
                width={pillW}
                height={pillH}
                rx={pillH / 2}
                fill={on ? 'var(--color-accent)' : 'var(--color-surface)'}
                stroke="var(--color-accent)"
                strokeWidth={0.02}
              />
              <text
                x={mx}
                y={my + 0.055}
                fontSize={0.15}
                textAnchor="middle"
                fill={on ? 'var(--color-accent-contrast)' : 'var(--color-accent)'}
                fontWeight={700}
              >
                Forex
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-[var(--color-text-muted)]">
        Schalter „Forex“ an jeder freien Außenkante: 5-mm-Platte direkt vor der Kante, vom Boden bis 1 cm unter die
        Belag-Oberkante. Vorderkante = unten im Plan.
      </p>

      {groups.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Drucke</h3>
          {groups.map((group) => {
            const thumb = prints[group.panels[0].panel.id];
            const hasPrint = group.panels.some((p) => prints[p.panel.id]);
            const label =
              group.printGroup !== undefined
                ? `${groupLabel(group.printGroup)} · ${group.panels.length} ${group.panels.length === 1 ? 'Platte' : 'Platten'}`
                : `Podest ${pieceNo(group.panels[0].panel.pieceId)} · ${SIDE_LABELS[group.panels[0].panel.side]}`;
            return (
              <div
                key={group.key}
                className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              >
                {thumb ? (
                  <img src={thumb} alt="Druck" className="h-8 w-16 rounded border border-[var(--color-border)] object-cover" />
                ) : (
                  <div className="h-8 w-16 rounded border border-[var(--color-border)] bg-white" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[var(--color-text)]">{label}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {(Math.round(group.lengthM * 100) / 100).toString().replace('.', ',')} m breit
                  </div>
                </div>
                {group.panels.length === 1 && (
                  <select
                    value={group.printGroup ?? ''}
                    onChange={(e) => onSetPrintGroup(group.panels[0].panel.id, e.target.value || undefined)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                    title="Mehrere Platten zu einem durchlaufenden Druck verbinden"
                  >
                    <option value="">Eigener Druck</option>
                    {groupNames
                      .filter((g) => g !== group.printGroup)
                      .map((g) => (
                        <option key={g} value={g}>
                          Zu „{groupLabel(g)}“
                        </option>
                      ))}
                    <option value="__new">Neue Druckgruppe</option>
                  </select>
                )}
                {group.panels.length > 1 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-[var(--color-text-muted)]">Platten</summary>
                    <ul className="mt-1 space-y-0.5">
                      {group.panels.map((p) => (
                        <li key={p.panel.id} className="flex items-center gap-1.5">
                          Podest {pieceNo(p.panel.pieceId)} · {SIDE_LABELS[p.panel.side]}
                          <button
                            type="button"
                            onClick={() => onSetPrintGroup(p.panel.id, undefined)}
                            className="underline text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                          >
                            lösen
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <label className="cursor-pointer rounded-md border border-[var(--color-accent)] px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-panel-fill)]">
                  {busyKey === group.key ? 'Lädt …' : hasPrint ? 'Druck ersetzen' : 'Druck hochladen'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busyKey !== null}
                    onChange={(e) => handleUpload(group, e)}
                  />
                </label>
                {hasPrint && (
                  <button
                    type="button"
                    onClick={() => onRemovePrint(group)}
                    className="text-xs text-[var(--color-text-muted)] underline hover:text-[var(--color-danger)]"
                  >
                    Druck entfernen
                  </button>
                )}
              </div>
            );
          })}
          {uploadError && <p className="text-xs text-[var(--color-danger)]">{uploadError}</p>}
          <p className="text-xs text-[var(--color-text-muted)]">
            Ein Druck einer Gruppe wird von links nach rechts (von außen gesehen) über ihre Platten verteilt und in der
            3D-Ansicht gezeigt. Drucke bleiben nur in diesem Browser gespeichert und sind nicht Teil der Plan-Datei — in
            der Stadthallenplanung werden sie separat hochgeladen.
          </p>
        </div>
      )}
    </div>
  );
}
