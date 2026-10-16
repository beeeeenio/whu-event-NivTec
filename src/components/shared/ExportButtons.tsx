import { useState } from 'react';
import type { MaterialListItem } from '../../domain/types';
import type { CiId } from '../../lib/ci';
import { materialListToCsv } from '../../lib/csv';
import { downloadTextFile } from '../../lib/download';
import { exportCanvasAsPng } from '../../lib/canvasExport';
import { exportLayoutAsPptx, exportSectionsAsPptx, type PptxSection } from '../../lib/pptxExport';

export interface PptxExportData {
  sections: PptxSection[];
  title: string;
  /** Aktive Initiative — deren Logo landet oben rechts auf der exportierten Folie. */
  ci: CiId;
}

interface Props {
  materialList: MaterialListItem[];
  /** Async function that returns the 3D Canvas — handles showing the 3D view temporarily if hidden. */
  getCanvas: () => Promise<HTMLCanvasElement | null>;
  filenamePrefix: string;
  /** Wenn gesetzt, wird zusätzlich ein PowerPoint-Export-Button angezeigt (editierbare Formen). */
  pptx?: PptxExportData;
}

export function ExportButtons({ materialList, getCanvas, filenamePrefix, pptx }: Props) {
  const [exportError, setExportError] = useState<string | null>(null);

  function handleCsvExport() {
    const csv = materialListToCsv(materialList);
    downloadTextFile(`${filenamePrefix}-materialliste.csv`, csv, 'text/csv;charset=utf-8', true);
  }

  async function handlePngExport() {
    try {
      const canvas = await getCanvas();
      if (!canvas) {
        setExportError('3D-Ansicht konnte nicht geladen werden.');
        return;
      }
      await exportCanvasAsPng(canvas, `${filenamePrefix}-3d.png`);
      setExportError(null);
    } catch {
      setExportError('PNG-Export fehlgeschlagen.');
    }
  }

  async function handlePptxExport() {
    if (!pptx) return;
    if (pptx.sections.length === 1) {
      const s = pptx.sections[0];
      await exportLayoutAsPptx(s.layout, s.feet, s.heightCm, `${filenamePrefix}-grundriss.pptx`, pptx.ci, pptx.title, {
        showDimensions: s.showDimensions,
        annotations: s.annotations,
      });
    } else {
      await exportSectionsAsPptx(pptx.sections, `${filenamePrefix}-grundriss.pptx`, pptx.ci, pptx.title);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCsvExport}
          className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
        >
          CSV Export
        </button>
        <button
          type="button"
          onClick={handlePngExport}
          className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
        >
          PNG Export (3D)
        </button>
        {pptx && (
          <button
            type="button"
            onClick={handlePptxExport}
            className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
          >
            PPTX Export
          </button>
        )}
      </div>
      {exportError && <p className="text-xs text-[var(--color-danger)]">{exportError}</p>}
    </div>
  );
}
