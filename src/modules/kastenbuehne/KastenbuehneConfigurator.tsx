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
import { boundingBoxOf, buildLayoutFromPieces, makePieceId, normalizeToOrigin } from '../../domain/customShape';
import { shiftAnnotations } from '../../domain/annotations';
import { obstaclesOverlapping, piecesOutsideRoom } from '../../domain/room';
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
import { RoomPanel } from '../../components/shared/RoomPanel';

type ResultTab = 'kennzahlen' | 'grundriss' | '3d' | 'material';

export function KastenbuehneConfigurator({ ci }: { ci: CiId }) {
  const [resultTab, setResultTab] = useState<ResultTab>('kennzahlen');
  // Maßketten im Grundriss und in der PPTX (Standard: an).
  const [showPlanDims, setShowPlanDims] = useState(true);
  // Ansicht: Bühne sperren und Forex-Blenden ausblenden. Nicht in der Plan-Datei; die Materialliste bleibt vollständig, das 3D-Bild im Export zeigt die aktuelle Ansicht.
  const [stageLocked, setStageLocked] = useState(false);
  const [forexHidden, setForexHidden] = useState(false);
  const { onCanvasReady, getCanvas } = useExportCanvas(() => setResultTab('3d'));

  // Ein Dokument, eine Undo-Historie: Höhe, Stücke und Forex-Blenden. Import und "Verwerfen" sind
  // jeweils ein einziger Schritt, Höhe/Stück/Blende ändern sich je Schritt einzeln.
  const doc = useUndoableState<KastenbuehneDoc>({
    heightCm: STRUCTURE_RULES.buehne.heightOptionsCm[0],
    pieces: [],
    forexPanels: [],
    annotations: [],
  });
  const { set: setDoc, undo, redo, canUndo, canRedo, transact } = doc;
  const { heightCm, pieces, forexPanels, room, annotations } = doc.value;
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
  // Notizen liegen in den Koordinaten der Zeichenfläche; für den Export um dieselbe Verschiebung
  // wie die normalisierten Stücke zurücksetzen, sonst säßen sie neben der Fläche.
  const exportAnnotations = useMemo(() => {
    const origin = boundingBoxOf(pieces);
    return origin ? shiftAnnotations(annotations, -origin.x, -origin.y) : annotations;
  }, [pieces, annotations]);

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

  // Stücke auf Hindernissen oder außerhalb des Raums (nur mit Raum). Der Raum liegt in denselben
  // Koordinaten wie der Editor, daher wird gegen die echten Positionen geprüft, nicht gegen normalizedPieces.
  const roomConflictCount = useMemo(() => {
    const outside = new Set(piecesOutsideRoom(pieces, room).map((p) => p.id));
    for (const p of pieces) {
      if (obstaclesOverlapping([p], room).length > 0) outside.add(p.id);
    }
    return outside.size;
  }, [pieces, room]);

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
    doc.set((d) => ({
      heightCm: v.heightCm ?? d.heightCm,
      pieces: v.pieces,
      forexPanels: v.forexPanels ?? [],
      room: v.room,
      annotations: v.annotations ?? [],
    }));
    return null;
  }

  // forexPanels und room nur mitschreiben, wenn es welche gibt — Dateien ohne Blenden/Raum bleiben wie bisher.
  const currentSavedState: KastenbuehneSavedState = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    kind: 'kastenbuehne',
    heightCm,
    pieces,
    ...(activeForexPanels.length > 0 ? { forexPanels: activeForexPanels } : {}),
    ...(room ? { room } : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
  };

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
                doc.set({ heightCm: STRUCTURE_RULES.buehne.heightOptionsCm[0], pieces: [], forexPanels: [], room: undefined, annotations: [] });
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Aufbau per Drag & Drop</h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStageLocked((v) => !v)}
              aria-pressed={stageLocked}
              title="Gesperrte Bühne: Stücke bleiben sichtbar, lassen sich aber nicht bearbeiten"
              className={ACTION_BTN}
            >
              {stageLocked ? 'Bühne entsperren' : 'Bühne sperren'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Höhe</span>
          <HeightSelector heightOptionsCm={STRUCTURE_RULES.buehne.heightOptionsCm} valueCm={heightCm} onChange={setHeightCm} />
          <span className="text-xs text-[var(--color-text-muted)]">
            Fußtyp: Alu-Lastenverteilerfuß (LV-Fuß), Höhenserie 20–200 cm
          </span>
        </div>
        <details className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text)]">
            Raum & Hindernisse
            {room && (
              <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
                {formatMeters(room.widthM)} × {formatMeters(room.depthM)} m, {room.obstacles.length} Hindernisse
              </span>
            )}
          </summary>
          <div className="mt-3">
            <RoomPanel room={room} onChange={(r) => doc.set((d) => setDocField(d, 'room', r))} />
          </div>
        </details>
        {roomConflictCount > 0 && (
          <WarningBanner>
            {roomConflictCount === 1 ? '1 Stück liegt' : `${roomConflictCount} Stücke liegen`} auf Hindernissen oder
            außerhalb des Raums.
          </WarningBanner>
        )}
        <PieceCanvasEditor
          {...editorProps}
          locked={stageLocked}
          room={room}
          annotations={annotations}
          onAnnotationsChange={(a) => setDoc((d) => setDocField(d, 'annotations', a))}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Forex-Blenden</h2>
            <button
              type="button"
              onClick={() => setForexHidden((v) => !v)}
              aria-pressed={forexHidden}
              title="Blenden nur ausblenden: Plan-Datei und Materialliste bleiben vollständig; das 3D-Bild im Export zeigt die aktuelle Ansicht"
              className={ACTION_BTN}
            >
              {forexHidden ? 'Forex-Blenden einblenden' : 'Forex-Blenden ausblenden'}
            </button>
          </div>
          {forexHidden ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
              <span>Forex-Blenden ausgeblendet. Sie bleiben in Plan-Datei und Materialliste erhalten, fehlen aber in 3D und im 3D-Bild des Exports.</span>
              <button type="button" onClick={() => setForexHidden(false)} className="text-xs underline text-[var(--color-accent)]">
                Einblenden
              </button>
            </div>
          ) : (
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
          )}
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
            <label className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={showPlanDims} onChange={(e) => setShowPlanDims(e.target.checked)} />
              Maßketten
            </label>
            <ExportButtons
              materialList={materialList}
              getCanvas={getCanvas}
              filenamePrefix="kastenbuehne"
              pptx={{
                sections: [
                  {
                    layout,
                    feet: labeledFeet,
                    heightCm,
                    label: 'Kastenbühne',
                    showDimensions: showPlanDims,
                    annotations: exportAnnotations,
                  },
                ],
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
          {resultTab === 'grundriss' && (
            <FloorPlanSVG layout={layout} feet={labeledFeet} heightCm={heightCm} showDimensions={showPlanDims} />
          )}
          {/* AufbauScene3D bleibt unabhängig vom aktiven Tab immer gemountet — der PNG-Export
              braucht die live WebGL-Canvas-Referenz, die beim Unmounten verloren ginge. */}
          <div className={resultTab === '3d' ? '' : 'hidden'}>
            <AufbauScene3D
              tiers={[{ layout, feet: labeledFeet, heightM: heightCm / 100, forex: forexHidden ? [] : placedForex, forexPrints: visiblePrints }]}
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
