import { useState } from 'react';
import { downloadTextFile } from '../../lib/download';
import { printSvgDocument } from '../../lib/printSvg';
import {
  buildScaledPlanSvg,
  planFitsOnPaper,
  type PaperFormat,
  type PaperOrientation,
  type PlanScale,
  type ScaledPlanOptions,
  type ScaledPlanSection,
} from '../../lib/scaledPlan';

interface Props {
  sections: ScaledPlanSection[];
  title: string;
  filenamePrefix: string;
  organisation?: string;
}

const SELECT_CLASS =
  'px-2 py-1 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]';
const BUTTON_CLASS =
  'px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed';

/** Maßstäblicher Plan als SVG-Download oder Druck/PDF über die Druckansicht; die Einstellungen liegen im aufklappbaren Panel. */
export function ScaledPlanExport({ sections, title, filenamePrefix, organisation }: Props) {
  const [scale, setScale] = useState<PlanScale>(50);
  const [paper, setPaper] = useState<PaperFormat>('A4');
  const [orientation, setOrientation] = useState<PaperOrientation>('quer');
  // Startwert übernimmt die Maßketten-Einstellung des Editors, damit beide Schalter zusammenpassen.
  const [dims, setDims] = useState(() => sections.some((s) => s.showDimensions));

  const options = (): ScaledPlanOptions => ({
    title,
    dateText: new Date().toLocaleDateString('de-DE'),
    scale,
    paper,
    orientation,
    sections: sections.map((s) => ({ ...s, showDimensions: dims })),
    organisation,
  });

  const fits = planFitsOnPaper(options());

  function handleSvgDownload() {
    const opts = options();
    downloadTextFile(`${filenamePrefix}-plan-1zu${scale}-${paper}.svg`, buildScaledPlanSvg(opts), 'image/svg+xml;charset=utf-8');
  }

  function handlePrint() {
    printSvgDocument(buildScaledPlanSvg(options()), paper, orientation);
  }

  return (
    <details className="text-sm text-[var(--color-text)]">
      <summary className="cursor-pointer px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] w-fit">
        Maßstäblicher Plan …
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-1.5">
            Maßstab
            <select className={SELECT_CLASS} value={scale} onChange={(e) => setScale(Number(e.target.value) as PlanScale)}>
              <option value={50}>1:50</option>
              <option value={100}>1:100</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Format
            <select className={SELECT_CLASS} value={paper} onChange={(e) => setPaper(e.target.value as PaperFormat)}>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Ausrichtung
            <select className={SELECT_CLASS} value={orientation} onChange={(e) => setOrientation(e.target.value as PaperOrientation)}>
              <option value="quer">quer</option>
              <option value="hoch">hoch</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={dims} onChange={(e) => setDims(e.target.checked)} />
            Maßketten
          </label>
        </div>

        {!fits && (
          <p className="text-xs text-[var(--color-danger)]">
            Passt bei 1:{scale} nicht auf {paper} {orientation} – bitte 1:100, A3 oder eine andere Ausrichtung wählen.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleSvgDownload} disabled={!fits} className={BUTTON_CLASS}>
            SVG herunterladen
          </button>
          <button type="button" onClick={handlePrint} disabled={!fits} className={BUTTON_CLASS}>
            Drucken / als PDF speichern
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Im Druckdialog Skalierung auf 100 % bzw. „Tatsächliche Größe“ stellen und Ränder auf „Keine“ setzen, damit der Maßstab stimmt.
        </p>
      </div>
    </details>
  );
}
