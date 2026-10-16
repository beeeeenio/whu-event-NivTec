import { useEffect, useMemo, useRef, useState } from 'react';
import { AufbauScene3D } from '../../components/shared/AufbauScene3D';
import { ExportButtons } from '../../components/shared/ExportButtons';
import { FloorPlanSVG } from '../../components/shared/FloorPlanSVG';
import { FootColorLegend } from '../../components/shared/FootColorLegend';
import { HeightSelector } from '../../components/shared/HeightSelector';
import { MaterialListTable } from '../../components/shared/MaterialListTable';
import { PieceCanvasEditor } from '../../components/shared/PieceCanvasEditor';
import { PlanFileBar } from '../../components/shared/PlanFileBar';
import { PlacedPiecesChips } from '../../components/shared/PlacedPiecesChips';
import { SavedConfigsPanel } from '../../components/shared/SavedConfigsPanel';
import { StairsRampCalculator } from '../../components/shared/StairsRampCalculator';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { WarningBanner } from '../../components/shared/WarningBanner';
import { buildLayoutFromPieces, makePieceId, normalizeToOrigin } from '../../domain/customShape';
import {
  addAllFrontEdges,
  appendMaterialItems,
  buildForexMaterialItems,
  nextPrintGroupName,
  placeForexPanels,
  pruneForexPrints,
  setForexPrintGroup,
  toggleForexPanel,
  type ForexPrintGroup,
} from '../../domain/forex';
import { loadForexPrints, saveForexPrints, type ForexPrints } from '../../lib/forexPrintStore';
import { slicePrint } from '../../lib/printImage';
import { STRUCTURE_RULES } from '../../domain/rules';
import { parseKastenbuehneFile, type KastenbuehneSavedState } from '../../domain/savedState';
import { PLAN_SCHEMA_VERSION } from '../../domain/migrations';
import { formatMeters } from '../../lib/format';
import { useDraftAutosave } from '../../hooks/useDraftAutosave';
import { useExportCanvas } from '../../hooks/useExportCanvas';
import { NO_RAILING_SIDES, useDerivedGeometry } from '../../hooks/useDerivedGeometry';
import { useUndoableState } from '../../hooks/useUndoableState';
import { createPieceLayerProps } from '../../lib/pieceLayerProps';
import type { CiId } from '../../lib/ci';
import { setDocField, type KastenbuehneDoc } from '../../domain/planDocument';
import type { ForexPanel, ForexSide } from '../../domain/types';
import { ForexEdgeEditor } from './ForexEdgeEditor';
import { STAGE_TEMPLATES } from '../../domain/templates';
import { ACTION_BTN } from '../../components/shared/editor/styles';

type ResultTab = 'kennzahlen' | 'grundriss' | '3d' | 'material';

export function KastenbuehneConfigurator({ ci }: { ci: CiId }) {
  const [resultTab, setResultTab] = useState<ResultTab>('kennzahlen');
  const { onCanvasReady, getCanvas } = useExportCanvas(() => setResultTab('3d'));

  // Ein Dokument, eine Undo-Historie: Höhe, Stücke und Forex-Blenden. Import und "Verwerfen" sind
  // jeweils ein einziger Schritt, Höhe/Stück/Blende ändern sich je Schritt einzeln.
  const doc = useUndoableState<KastenbuehneDoc>({
    heightCm: STRUCTURE_RULES.buehne.heightOptionsCm[0],
    pieces: [],
    forexPanels: [],
  });
  const { set: setDoc, undo, redo, canUndo, canRedo, transact } = doc;
  const { heightCm, pieces, forexPanels } = doc.value;
  const setHeightCm = (v: number) => doc.set((d) => setDocField(d, 'heightCm', v));
  const setForexPanels = (u: ForexPanel[] | ((p: ForexPanel[]) => ForexPanel[])) =>
    doc.set((d) => setDocField(d, 'forexPanels', u));

  const editorProps = useMemo(
    () =>
      createPieceLayerProps(pieces, (u) => setDoc((d) => setDocField(d, 'pieces', u)), {
        undo,
        redo,
        canUndo,
        canRedo,
        transact,
      }),
    [pieces, setDoc, undo, redo, canUndo, canRedo, transact],
  );

  // Alles Abgeleitete (Kennzahlen, Grundriss, 3D, PPTX, Materialliste) sieht die Bühne an (0,0) —
  // wo sie auf der Zeichenfläche liegt ("Alles verschieben"), soll dort nichts verändern. Der
  // Editor selbst bekommt weiter die echten Positionen.
  const normalizedPieces = useMemo(() => normalizeToOrigin(pieces), [pieces]);
  const layout = useMemo(() => buildLayoutFromPieces(normalizedPieces), [normalizedPieces]);

  // Forex-Blenden hängen per pieceId an einer Kante. Liegt dort (nach Verschieben/Löschen) kein
  // freies Podest mehr, fallen sie aus 3D, Materialliste und Export heraus.
  const placedForex = useMemo(() => placeForexPanels(normalizedPieces, forexPanels), [normalizedPieces, forexPanels]);
  const activeForexPanels = useMemo(() => placedForex.map((f) => f.panel), [placedForex]);

  // Druckbilder je ForexPanel.id — nur lokal (IndexedDB), nie in der Plan-Datei.
  const [forexPrints, setForexPrints] = useState<ForexPrints>({});
  const printsLoadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    loadForexPrints('kastenbuehne').then((stored) => {
      if (cancelled) return;
      printsLoadedRef.current = true;
      setForexPrints((prev) => ({ ...stored, ...prev }));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!printsLoadedRef.current) return;
    void saveForexPrints('kastenbuehne', forexPrints);
  }, [forexPrints]);
  // Drucke entfernter Blenden fallen weg (Blenden an gerade belegten Kanten behalten ihren Druck).
  const visiblePrints = useMemo(() => pruneForexPrints(forexPrints, forexPanels), [forexPrints, forexPanels]);

  async function handleUploadPrint(group: ForexPrintGroup, file: File) {
    const parts = await slicePrint(file, group.panels.map((p) => p.edge.lengthM));
    setForexPrints((prev) => {
      const next = { ...pruneForexPrints(prev, forexPanels) };
      group.panels.forEach((p, i) => {
        next[p.panel.id] = parts[i];
      });
      return next;
    });
  }

  function handleRemovePrint(group: ForexPrintGroup) {
    setForexPrints((prev) => {
      const next = { ...prev };
      for (const p of group.panels) delete next[p.panel.id];
      return next;
    });
  }

  function handleSetPrintGroup(panelId: string, printGroup: string | undefined) {
    setForexPanels((prev) =>
      setForexPrintGroup(prev, panelId, printGroup === '__new' ? nextPrintGroupName(prev) : printGroup),
    );
  }

  // Kastenbühne ist regeltechnisch eine ganz normale Bühne (gleiche Höhenserie,
  // Verstrebungs-/Geländerschwellen) — nur der Bauweg dahin ist ein anderer.
  const { totalFeet, labeledFeet, materialList: podestMaterialList } = useDerivedGeometry(
    layout,
    'buehne',
    heightCm,
    NO_RAILING_SIDES,
  );
  const materialList = useMemo(
    () => appendMaterialItems(podestMaterialList, buildForexMaterialItems(normalizedPieces, forexPanels, heightCm)),
    [podestMaterialList, normalizedPieces, forexPanels, heightCm],
  );

  const hasContent = pieces.length > 0;

  // Import-Bericht: verworfene Stücke/Blenden und neu vergebene IDs aus dem letzten Laden
  const [importNotes, setImportNotes] = useState<string[]>([]);

  function applySavedState(data: unknown): string | null {
    const result = parseKastenbuehneFile(data);
    if (!result.ok) {
      setImportNotes([]);
      return result.error;
    }
    setImportNotes(result.warnings);
    const v = result.value;
    // Import ist ein einziger Undo-Schritt: Höhe, Stücke und Blenden zusammen.
    doc.set((d) => ({ heightCm: v.heightCm ?? d.heightCm, pieces: v.pieces, forexPanels: v.forexPanels ?? [] }));
    return null;
  }

  // forexPanels nur mitschreiben, wenn es welche gibt — Dateien ohne Blenden bleiben wie bisher.
  const currentSavedState: KastenbuehneSavedState =
    activeForexPanels.length > 0
      ? { schemaVersion: PLAN_SCHEMA_VERSION, kind: 'kastenbuehne', heightCm, pieces, forexPanels: activeForexPanels }
      : { schemaVersion: PLAN_SCHEMA_VERSION, kind: 'kastenbuehne', heightCm, pieces };

  function handleToggleForex(pieceId: string, side: ForexSide) {
    setForexPanels((prev) => toggleForexPanel(prev, pieceId, side));
  }
  const { restored, discard, saveError, otherTabChanged, reloadFromOtherTab, dismissOtherTab } = useDraftAutosave(
    'kastenbuehne',
    currentSavedState,
    applySavedState,
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Kastenbühne</h2>
          <PlanFileBar
            namespace="kastenbuehne"
            currentData={currentSavedState}
            onLoad={applySavedState}
          />
        </div>
        {importNotes.length > 0 && (
          <WarningBanner onDismiss={() => setImportNotes([])}>Import-Bericht: {importNotes.join(' ')}</WarningBanner>
        )}
        {restored && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-accent)]">
            <span>Letzter Stand automatisch wiederhergestellt.</span>
            <button
              type="button"
              onClick={() => {
                discard();
                doc.set({ heightCm: STRUCTURE_RULES.buehne.heightOptionsCm[0], pieces: [], forexPanels: [] });
                setForexPrints({});
              }}
              className="shrink-0 text-xs underline"
            >
              Verwerfen
            </button>
          </div>
        )}
        {saveError && <WarningBanner>{saveError}</WarningBanner>}
        {otherTabChanged && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-warning)] px-3 py-2 text-sm text-[var(--color-warning)]">
            <span>Dieser Plan wurde in einem anderen Tab geändert.</span>
            <div className="flex shrink-0 gap-3 text-xs">
              <button type="button" onClick={reloadFromOtherTab} className="underline">
                Stand aus dem anderen Tab laden
              </button>
              <button type="button" onClick={dismissOtherTab} className="underline">
                Hier weiterarbeiten
              </button>
            </div>
          </div>
        )}
        <p className="text-sm text-[var(--color-text-muted)]">
          Kein Regler, keine vorgefertigte Fläche — ziehe Stücke direkt auf einen leeren Plan. Alles entsteht
          ausschließlich durch das, was du selbst platzierst.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Aufbau per Drag & Drop</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Höhe</span>
          <HeightSelector heightOptionsCm={STRUCTURE_RULES.buehne.heightOptionsCm} valueCm={heightCm} onChange={setHeightCm} />
          <span className="text-xs text-[var(--color-text-muted)]">
            Fußtyp: Alu-Lastenverteilerfuß (LV-Fuß), Höhenserie 20–200 cm
          </span>
        </div>
        <PieceCanvasEditor
          {...editorProps}
          frontEdgeLabel="Vorderkante"
          emptyHint={
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="w-full text-xs font-semibold">Oder mit einer Vorlage starten:</span>
              {STAGE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={ACTION_BTN}
                  onClick={() => editorProps.onReplaceAll(t.build().map((p) => ({ ...p, id: makePieceId() })))}
                >
                  {t.label}
                </button>
              ))}
            </div>
          }
        />
        <PlacedPiecesChips pieces={pieces} onRemovePiece={editorProps.onRemovePiece} />
      </section>

      {hasContent && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Forex-Blenden</h2>
          <ForexEdgeEditor
            pieces={normalizedPieces}
            forexPanels={activeForexPanels}
            placed={placedForex}
            prints={visiblePrints}
            onToggle={handleToggleForex}
            onUploadPrint={handleUploadPrint}
            onRemovePrint={handleRemovePrint}
            onSetPrintGroup={handleSetPrintGroup}
            onAllFrontEdges={() => setForexPanels((prev) => addAllFrontEdges(normalizedPieces, prev))}
            onClear={() => setForexPanels([])}
          />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Geländer</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Bei frei zusammengestellten Formen nicht seitenweise konfigurierbar (Kontur nicht garantiert rechteckig).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Zugang</h2>
        <StairsRampCalculator heightCm={heightCm} />
      </section>

      {hasContent && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex rounded-md border border-[var(--color-panel-stroke)] overflow-hidden">
              {(
                [
                  ['kennzahlen', 'Kennzahlen'],
                  ['grundriss', 'Grundrissplan'],
                  ['3d', '3D-Ansicht'],
                  ['material', 'Materialliste'],
                ] as const
              ).map(([tab, label], idx) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setResultTab(tab)}
                  className={`px-3 py-1.5 text-sm ${idx > 0 ? 'border-l border-[var(--color-panel-stroke)]' : ''} ${
                    resultTab === tab
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-panel-fill)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ExportButtons
              materialList={materialList}
              getCanvas={getCanvas}
              filenamePrefix="kastenbuehne"
              pptx={{
                sections: [{ layout, feet: labeledFeet, heightCm, label: 'Kastenbühne' }],
                title: 'Kastenbühne',
                ci,
              }}
            />
          </div>

          {resultTab === 'kennzahlen' && (
            <SummaryStats
              stats={[
                { label: 'Baugröße', value: `${formatMeters(layout.widthM)} × ${formatMeters(layout.depthM)} m` },
                { label: 'Fläche', value: `${formatMeters(layout.areaM2)} m²` },
                { label: 'Podeste', value: `${layout.panels.length}`, hint: 'Systempodeste' },
                { label: 'Füße gesamt', value: `${totalFeet}` },
              ]}
            />
          )}

          {(resultTab === 'grundriss' || resultTab === '3d') && <FootColorLegend heights={[heightCm]} />}
          {resultTab === 'grundriss' && <FloorPlanSVG layout={layout} feet={labeledFeet} heightCm={heightCm} />}
          {/* AufbauScene3D bleibt unabhängig vom aktiven Tab immer gemountet — der PNG-Export
              braucht die live WebGL-Canvas-Referenz, die beim Unmounten verloren ginge. */}
          <div className={resultTab === '3d' ? '' : 'hidden'}>
            <AufbauScene3D
              tiers={[{ layout, feet: labeledFeet, heightM: heightCm / 100, forex: placedForex, forexPrints: visiblePrints }]}
              onCanvasReady={onCanvasReady}
            />
          </div>

          {resultTab === 'material' && <MaterialListTable items={materialList} />}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Im Browser gespeichert</h2>
        <SavedConfigsPanel namespace="kastenbuehne" currentData={currentSavedState} onLoad={applySavedState} />
      </section>
    </div>
  );
}
