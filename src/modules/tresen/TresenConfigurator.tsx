import { useMemo, useState } from 'react';
import { AufbauScene3D, PANEL_THICKNESS_M } from '../../components/shared/AufbauScene3D';
import { ExportButtons } from '../../components/shared/ExportButtons';
import { FloorPlanSVG } from '../../components/shared/FloorPlanSVG';
import { FootColorLegend } from '../../components/shared/FootColorLegend';
import { HeightSelector } from '../../components/shared/HeightSelector';
import { MaterialListTable } from '../../components/shared/MaterialListTable';
import { PieceCanvasEditor } from '../../components/shared/PieceCanvasEditor';
import { PlanFileBar } from '../../components/shared/PlanFileBar';
import { PlacedPiecesChips } from '../../components/shared/PlacedPiecesChips';
import { SavedConfigsPanel } from '../../components/shared/SavedConfigsPanel';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { WarningBanner } from '../../components/shared/WarningBanner';
import { boundingBoxOf, buildLayoutFromPieces, fillHorizontalSpan, makePieceId } from '../../domain/customShape';
import { obstaclesOverlapping, piecesOutsideRoom } from '../../domain/room';
import { RoomPanel } from '../../components/shared/RoomPanel';
import { buildMaterialList, mergeMaterialLists } from '../../domain/materialList';
import { isBracingRequired, STRUCTURE_RULES } from '../../domain/rules';
import { SPINDEL_HEIGHT_OPTIONS_CM } from '../../domain/tresen';
import { CATALOG_DEPTHS_M } from '../../domain/panels';
import { TRESEN_TEMPLATES } from '../../domain/templates';
import { ACTION_BTN } from '../../components/shared/editor/styles';
import { parseTresenFile, type TresenSavedState } from '../../domain/savedState';
import { PLAN_SCHEMA_VERSION } from '../../domain/migrations';
import { formatMeters } from '../../lib/format';
import { useDraftAutosave } from '../../hooks/useDraftAutosave';
import { useExportCanvas } from '../../hooks/useExportCanvas';
import { NO_RAILING_SIDES, useDerivedGeometry } from '../../hooks/useDerivedGeometry';
import { useUndoableState } from '../../hooks/useUndoableState';
import { createPieceLayerProps } from '../../lib/pieceLayerProps';
import type { CiId } from '../../lib/ci';
import { setDocField, type TresenDoc } from '../../domain/planDocument';

// Kein Schnellstart-Regler: jede Ebene wächst ausschließlich mit dem, was tatsächlich
// gebaut wurde — Mindestbreite, damit ein leerer Plan nicht winzig wirkt, plus Puffer. Beide
// Werte fließen NUR in die gemeinsame Skala zwischen Unterbau und Thekenplatte ein (siehe
// sharedCanvasWidthM unten) — der Editor selbst bestimmt seine tatsächliche Standardgröße.
const MIN_CANVAS_WIDTH_M = 6;
const CANVAS_BUFFER_M = 2;


type ResultTab = 'kennzahlen' | 'grundriss' | '3d' | 'material';

/** Ansichtszustand einer Ebene: gesperrt = nur Ansicht, ausgeblendet = kein Editor und nicht in 3D. Nicht in der Plan-Datei. */
interface LayerView {
  locked: boolean;
  hidden: boolean;
}
const NO_LAYER_VIEW: LayerView = { locked: false, hidden: false };

/** Schalter Sperren/Ausblenden neben der Ebenen-Überschrift. */
function LayerToggles({ view, onChange }: { view: LayerView; onChange: (next: LayerView) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange({ ...view, locked: !view.locked })}
        aria-pressed={view.locked}
        title="Gesperrte Ebene: Stücke bleiben sichtbar, lassen sich aber nicht bearbeiten"
        className={ACTION_BTN}
      >
        {view.locked ? 'Entsperren' : 'Sperren'}
      </button>
      <button
        type="button"
        onClick={() => onChange({ ...view, hidden: !view.hidden })}
        aria-pressed={view.hidden}
        title="Ausgeblendete Ebenen bleiben in Kennzahlen, Materialliste und Plan-Datei vollständig; in 3D und im 3D-Bild des Exports fehlen sie"
        className={ACTION_BTN}
      >
        {view.hidden ? 'Einblenden' : 'Ausblenden'}
      </button>
    </div>
  );
}

/** Platzhalter für eine ausgeblendete Ebene: kein Editor, nur der Schalter zum Einblenden. */
function LayerHidden({ label, onShow }: { label: string; onShow: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
      <span>Ebene ausgeblendet ({label}). Stücke bleiben erhalten.</span>
      <button type="button" onClick={onShow} className="text-xs underline text-[var(--color-accent)]">
        Einblenden
      </button>
    </div>
  );
}

/**
 * `shared`: geteilter Plan aus dem URL-Hash (Rohdaten). Solange er offen ist, zeigen alle Anzeigen
 * ihn nur lesend an; der eigene Entwurf bleibt unverändert. `onLeaveShared` verlässt die Ansicht.
 */
export function TresenConfigurator({
  ci,
  shared,
  onLeaveShared,
}: {
  ci: CiId;
  shared?: unknown;
  onLeaveShared?: () => void;
}) {
  const [resultTab, setResultTab] = useState<ResultTab>('kennzahlen');
  // Maßketten im Grundriss und in der PPTX (Standard: an).
  const [showPlanDims, setShowPlanDims] = useState(true);
  // Sperren und Ausblenden je Ebene: Ansichtszustand, bewusst nicht in der Plan-Datei.
  const [baseView, setBaseView] = useState<LayerView>(NO_LAYER_VIEW);
  const [topView, setTopView] = useState<LayerView>(NO_LAYER_VIEW);
  const { onCanvasReady, getCanvas } = useExportCanvas(() => setResultTab('3d'));

  // Ein Dokument, eine Undo-Historie für beide Ebenen und beide Höhen: Undo macht den letzten
  // Schritt des Dokuments rückgängig, egal in welcher Ebene er passiert ist. Import und
  // "Verwerfen" sind jeweils ein einziger Schritt.
  const doc = useUndoableState<TresenDoc>({
    baseHeightCm: STRUCTURE_RULES.tresen.heightOptionsCm[0],
    spindelHeightCm: SPINDEL_HEIGHT_OPTIONS_CM[1],
    basePieces: [],
    topPieces: [],
    annotations: [],
  });
  const { set: setDoc, undo, redo, canUndo, canRedo, transact } = doc;
  const own = doc.value;

  // Geteilter Plan (#plan=…): Nur-Lesen-Ansicht. Solange er offen ist, kommen alle Anzeigen aus view;
  // der eigene Entwurf (own) bleibt unberührt und wird nur für Autosave, Plan-Datei und Stände genutzt.
  const sharedParsed = useMemo(() => (shared ? parseTresenFile(shared) : null), [shared]);
  const sharedView = sharedParsed?.ok === true;
  const view = useMemo<TresenDoc>(
    () =>
      sharedParsed?.ok
        ? {
            baseHeightCm: sharedParsed.value.baseHeightCm ?? STRUCTURE_RULES.tresen.heightOptionsCm[0],
            spindelHeightCm: sharedParsed.value.spindelHeightCm ?? SPINDEL_HEIGHT_OPTIONS_CM[1],
            basePieces: sharedParsed.value.basePieces,
            topPieces: sharedParsed.value.topPieces,
            room: sharedParsed.value.room,
            annotations: sharedParsed.value.annotations ?? [],
          }
        : own,
    [sharedParsed, own],
  );
  const { baseHeightCm, spindelHeightCm, basePieces, topPieces, room, annotations } = view;
  const setBaseHeightCm = (v: number) => doc.set((d) => setDocField(d, 'baseHeightCm', v));
  const setSpindelHeightCm = (v: number) => doc.set((d) => setDocField(d, 'spindelHeightCm', v));

  // Im geteilten Plan gibt es weder Sperren noch Ausblenden: alle Ebenen sind sichtbar und nur lesbar.
  const effBaseView = sharedView ? NO_LAYER_VIEW : baseView;
  const effTopView = sharedView ? NO_LAYER_VIEW : topView;

  const baseEditorProps = useMemo(
    () =>
      createPieceLayerProps(basePieces, (u) => setDoc((d) => setDocField(d, 'basePieces', u)), {
        undo,
        redo,
        canUndo,
        canRedo,
        transact,
      }),
    [basePieces, setDoc, undo, redo, canUndo, canRedo, transact],
  );
  const topEditorProps = useMemo(
    () =>
      createPieceLayerProps(topPieces, (u) => setDoc((d) => setDocField(d, 'topPieces', u)), {
        undo,
        redo,
        canUndo,
        canRedo,
        transact,
      }),
    [topPieces, setDoc, undo, redo, canUndo, canRedo, transact],
  );

  const baseLayout = useMemo(() => buildLayoutFromPieces(basePieces), [basePieces]);
  const topLayout = useMemo(() => buildLayoutFromPieces(topPieces), [topPieces]);

  // Enges Begrenzungsrechteck statt layout.widthM/depthM (die immer vom Ursprung aus messen) —
  // sonst zeigt der Referenz-Umriss der jeweils anderen Ebene eine Fläche, in der die echten
  // Platten gar nicht liegen, sobald diese nicht vorderkantenbündig gebaut wurde.
  const baseBoundingBox = useMemo(() => boundingBoxOf(baseLayout.panels), [baseLayout]);
  const topBoundingBox = useMemo(() => boundingBoxOf(topLayout.panels), [topLayout]);

  // Gemeinsame Skala: ohne das würde jeder Canvas unabhängig auf seinen eigenen Inhalt
  // skalieren — eine tatsächlich schmalere Thekenplatte sähe dann trotzdem gleich breit wie
  // der Unterbau aus. Beide Editoren bekommen dieselbe Mindestbreite, damit 1 m in beiden
  // gleich viele Pixel sind.
  const baseCanvasWidthM = Math.max(MIN_CANVAS_WIDTH_M, baseLayout.widthM + CANVAS_BUFFER_M);
  const topCanvasWidthM = Math.max(MIN_CANVAS_WIDTH_M, topLayout.widthM + CANVAS_BUFFER_M);
  const sharedCanvasWidthM = Math.max(baseCanvasWidthM, topCanvasWidthM);

  const {
    totalFeet: baseTotalFeet,
    labeledFeet: baseLabeledFeet,
    materialList: baseMaterialList,
  } = useDerivedGeometry(baseLayout, 'tresen', baseHeightCm, NO_RAILING_SIDES);
  const { totalFeet: topTotalFeet, labeledFeet: topLabeledFeet } = useDerivedGeometry(
    topLayout,
    'tresen',
    spindelHeightCm,
    NO_RAILING_SIDES,
  );

  // Thekenplatte: eigenes Materialliste-Listing mit Spindelfuß-Label statt LV-Fuß, ohne Aussteifung.
  const topMaterialList = useMemo(
    () =>
      buildMaterialList({
        structureType: 'tresen',
        layout: topLayout,
        heightCm: spindelHeightCm,
        activeRailingSides: [],
        footLabel: `Alu-Verstellspindelfuß (VS-Fuß), Ausgleich ${spindelHeightCm} cm`,
        includeBracing: false,
      }),
    [topLayout, spindelHeightCm],
  );

  const bracingRequired = isBracingRequired('tresen', baseHeightCm);
  const totalHeightCm = Math.round(baseHeightCm + PANEL_THICKNESS_M * 100 + spindelHeightCm + PANEL_THICKNESS_M * 100);

  const materialList = useMemo(
    () => mergeMaterialLists([baseMaterialList, topMaterialList]),
    [baseMaterialList, topMaterialList],
  );

  const hasContent = basePieces.length > 0 || topPieces.length > 0;

  // Raum gilt nur für den Unterbau (siehe TresenDoc): Stücke auf Hindernissen oder außerhalb des Raums.
  const roomConflictCount = useMemo(() => {
    const outside = new Set(piecesOutsideRoom(basePieces, room).map((p) => p.id));
    for (const p of basePieces) {
      if (obstaclesOverlapping([p], room).length > 0) outside.add(p.id);
    }
    return outside.size;
  }, [basePieces, room]);

  // Setzt die Thekenplatte auf dieselbe Breite wie der aktuelle Unterbau, bei halber Tiefe —
  // ersetzt den bisherigen Inhalt der Ebene komplett (kein Zusammenführen), da das eine bewusste
  // Neuerzeugung ist, kein Hinzufügen. Zieltiefe wird aus CATALOG_DEPTHS_M ausgewählt: die größte
  // verfügbare Tiefe ≤ halbe Unterbau-Tiefe.
  //
  // Randnotiz zum früheren "kann die Thekenplatte nicht drehen"-Bug: Sondermaß-Platten dürfen laut
  // Bennis eigener Praxiserfahrung (siehe Korrektur in panels.ts) genau wie die Hauptplatte gedreht
  // verbaut werden — der eigentliche Fehler lag NICHT in der Rundung hier, sondern darin, dass die
  // so entstehenden, teils gedrehten Sondermaß-Stücke von isSondermassPiece/catalogSizeKey nicht
  // erkannt wurden (nur eine feste (w,d)-Reihenfolge geprüft) — dort behoben, nicht hier.
  function setThekeToHalfDepth() {
    // Echte Lage und Größe des Unterbaus (nicht vom Ursprung aus gemessen) — sonst landet die
    // Thekenplatte nach "Alles verschieben" des Unterbaus zu breit und am falschen Fleck.
    if (!baseBoundingBox) return;
    const EPS = 1e-6;
    const targetHalfDepth = baseBoundingBox.depthM / 2;
    const sortedDepths = [...CATALOG_DEPTHS_M].sort((a, b) => b - a);
    const targetDepthM = sortedDepths.find((d) => d <= targetHalfDepth + EPS) ?? 0.39;
    const filled = fillHorizontalSpan(baseBoundingBox.widthM, targetDepthM, baseBoundingBox.x, baseBoundingBox.y);
    const newTop = filled.map((p) => ({ ...p, id: makePieceId() }));
    doc.set((d) => setDocField(d, 'topPieces', newTop));
  }

  // Import-Bericht: verworfene Stücke und neu vergebene IDs aus dem letzten Laden
  const [importNotes, setImportNotes] = useState<string[]>([]);

  function applySavedState(data: unknown): string | null {
    const result = parseTresenFile(data);
    if (!result.ok) {
      setImportNotes([]);
      return result.error;
    }
    setImportNotes(result.warnings);
    const v = result.value;
    // Import ist ein einziger Undo-Schritt: beide Höhen und beide Ebenen zusammen.
    doc.set((d) => ({
      baseHeightCm: v.baseHeightCm ?? d.baseHeightCm,
      spindelHeightCm: v.spindelHeightCm ?? d.spindelHeightCm,
      basePieces: v.basePieces,
      topPieces: v.topPieces,
      room: v.room,
      annotations: v.annotations ?? [],
    }));
    return null;
  }

  // Laden aus Datei oder Stand ändert den eigenen Entwurf: dann die geteilte Ansicht verlassen, damit das Ergebnis sichtbar ist.
  function applyOwnState(data: unknown): string | null {
    const error = applySavedState(data);
    if (!error && sharedView) onLeaveShared?.();
    return error;
  }

  // room nur mitschreiben, wenn gesetzt — Dateien ohne Raum bleiben wie bisher.
  // Immer aus dem eigenen Entwurf, auch wenn gerade ein geteilter Plan angezeigt wird.
  const currentSavedState: TresenSavedState = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    kind: 'tresen',
    baseHeightCm: own.baseHeightCm,
    spindelHeightCm: own.spindelHeightCm,
    basePieces: own.basePieces,
    topPieces: own.topPieces,
    ...(own.room ? { room: own.room } : {}),
    ...(own.annotations.length > 0 ? { annotations: own.annotations } : {}),
  };
  const { restored, discard, saveError, otherTabChanged, reloadFromOtherTab, dismissOtherTab } = useDraftAutosave(
    'tresen',
    currentSavedState,
    applySavedState,
  );

  // Beide Ebenen bilden vorne (y=0, siehe Vorderkanten-Beschriftung in PieceCanvasEditor) eine
  // bündige Kante — links-/vorderkantenbündig, kein Versatz zwischen den Ebenen.
  const offsetZ = 0;
  const topBaseY = baseHeightCm / 100 + PANEL_THICKNESS_M;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Aufbau</h2>
          <PlanFileBar
            namespace="tresen"
            currentData={currentSavedState}
            onLoad={applyOwnState}
            shareKind="tresen"
          />
        </div>
        {sharedParsed?.ok && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-accent)]">
            <span>Geteilter Plan – Nur-Lesen-Ansicht. Dein eigener Entwurf bleibt unverändert.</span>
            <div className="flex shrink-0 gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  if (!applySavedState(shared)) onLeaveShared?.();
                }}
                className="underline"
              >
                In meinen Plan übernehmen
              </button>
              <button type="button" onClick={onLeaveShared} className="underline">
                Schließen
              </button>
            </div>
          </div>
        )}
        {sharedParsed && !sharedParsed.ok && (
          <WarningBanner>
            <span>{sharedParsed.error}</span>{' '}
            <button type="button" onClick={onLeaveShared} className="text-xs underline">
              Schließen
            </button>
          </WarningBanner>
        )}
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
                doc.set({
                  baseHeightCm: STRUCTURE_RULES.tresen.heightOptionsCm[0],
                  spindelHeightCm: SPINDEL_HEIGHT_OPTIONS_CM[1],
                  basePieces: [],
                  topPieces: [],
                  room: undefined,
                  annotations: [],
                });
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
          Zweistöckige Konstruktion: unten ein normales Systempodest auf LV-Füßen, darauf Verstellspindelfüße,
          darauf eine zweite Podestplatte als Thekenabschluss. Kein Regler, keine vorgefertigte Fläche — beide
          Ebenen sind eigene, leere Pläne: ziehe Stücke direkt drauf.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Unterbau per Drag & Drop</h2>
          {!sharedView && <LayerToggles view={baseView} onChange={setBaseView} />}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Höhe</span>
          {sharedView ? (
            <span className="text-sm font-semibold tabular-nums text-[var(--color-text)]">{baseHeightCm} cm</span>
          ) : (
            <HeightSelector heightOptionsCm={STRUCTURE_RULES.tresen.heightOptionsCm} valueCm={baseHeightCm} onChange={setBaseHeightCm} />
          )}
        </div>
        {bracingRequired && <WarningBanner>Ab 80 cm Unterbauhöhe ist eine Diagonalverstrebung erforderlich.</WarningBanner>}
        {/* Raum nur am Unterbau: Die Thekenplatte steht auf dem Unterbau, nicht auf dem Boden. */}
        <details className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text)]">
            Raum & Hindernisse (für den Unterbau)
            {room && (
              <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
                {formatMeters(room.widthM)} × {formatMeters(room.depthM)} m, {room.obstacles.length} Hindernisse
              </span>
            )}
          </summary>
          {!sharedView && (
            <div className="mt-3">
              <RoomPanel room={room} onChange={(r) => doc.set((d) => setDocField(d, 'room', r))} />
            </div>
          )}
        </details>
        {roomConflictCount > 0 && (
          <WarningBanner>
            {roomConflictCount === 1 ? '1 Stück liegt' : `${roomConflictCount} Stücke liegen`} auf Hindernissen oder
            außerhalb des Raums.
          </WarningBanner>
        )}
        {effBaseView.hidden ? (
          <LayerHidden label="Unterbau" onShow={() => setBaseView((v) => ({ ...v, hidden: false }))} />
        ) : (
          <>
            <PieceCanvasEditor
            {...baseEditorProps}
            locked={effBaseView.locked}
            readOnly={sharedView}
            room={room}
            annotations={annotations}
            onAnnotationsChange={(a) => setDoc((d) => setDocField(d, 'annotations', a))}
            frontEdgeLabel="Unterbau-Vorderkante"
            minCanvasWidthM={sharedCanvasWidthM}
            referenceFootprint={topBoundingBox ? { ...topBoundingBox, label: 'Thekenplatte' } : undefined}
            emptyHint={
              hasContent ? undefined : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="w-full text-xs font-semibold">Oder mit einer Vorlage starten (Unterbau und Platte):</span>
                  {TRESEN_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={ACTION_BTN}
                      onClick={() => {
                        // Beide Ebenen in EINEM Schritt setzen — ein Undo macht die ganze Vorlage rückgängig.
                        const { base, top } = t.build();
                        doc.set((d) => ({
                          ...d,
                          basePieces: base.map((p) => ({ ...p, id: makePieceId() })),
                          topPieces: top.map((p) => ({ ...p, id: makePieceId() })),
                        }));
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )
            }
          />
          {!sharedView && <PlacedPiecesChips pieces={basePieces} onRemovePiece={baseEditorProps.onRemovePiece} />}
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Thekenplatte per Drag & Drop</h2>
          {!sharedView && <LayerToggles view={topView} onChange={setTopView} />}
        </div>
        <div className="space-y-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Spindelfuß-Ausgleich</span>
            {sharedView && <span className="text-sm font-semibold tabular-nums text-[var(--color-text)]">{spindelHeightCm} cm</span>}
            {!sharedView && SPINDEL_HEIGHT_OPTIONS_CM.map((h) => {
              const active = spindelHeightCm === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setSpindelHeightCm(h)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    active
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
                  }`}
                >
                  {h} cm
                </button>
              );
            })}
            {!sharedView && (
              <button
                type="button"
                onClick={setThekeToHalfDepth}
                disabled={baseLayout.widthM <= 0}
                title="Ersetzt die Thekenplatte durch eine vorne bündige Fläche in Unterbau-Breite, bei halber Unterbau-Tiefe"
                className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-accent)] text-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
              >
                Breite übernehmen, Tiefe halbieren
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Praxis-Tipp: Die Thekenplatte ist meist genauso <strong>breit</strong> wie der Unterbau, aber nur halb so
            <strong> tief</strong> — beide Vorderkanten liegen auf einer Linie. Der gestrichelte Umriss im Plan unten
            zeigt den aktuellen Unterbau zum Vergleich.
          </p>
        </div>
        {effTopView.hidden ? (
          <LayerHidden label="Thekenplatte" onShow={() => setTopView((v) => ({ ...v, hidden: false }))} />
        ) : (
          <>
            <PieceCanvasEditor
              {...topEditorProps}
              locked={effTopView.locked}
              readOnly={sharedView}
              frontEdgeLabel="Thekenplatten-Vorderkante"
              minCanvasWidthM={sharedCanvasWidthM}
              referenceFootprint={baseBoundingBox ? { ...baseBoundingBox, label: 'Unterbau' } : undefined}
            />
            {!sharedView && <PlacedPiecesChips pieces={topPieces} onRemovePiece={topEditorProps.onRemovePiece} />}
          </>
        )}
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
              filenamePrefix="tresen"
              pptx={{
                // Der Tresen normalisiert seine Ebenen nicht, die Notizen liegen also schon in den richtigen Koordinaten.
                sections: [
                  {
                    layout: baseLayout,
                    feet: baseLabeledFeet,
                    heightCm: baseHeightCm,
                    label: 'Unterbau',
                    showDimensions: showPlanDims,
                    annotations,
                  },
                  {
                    layout: topLayout,
                    feet: topLabeledFeet,
                    heightCm: spindelHeightCm,
                    label: 'Thekenplatte (oben)',
                    showDimensions: showPlanDims,
                  },
                ],
                title: 'Tresen',
                ci,
              }}
            />
          </div>

          {resultTab === 'kennzahlen' && (
            <SummaryStats
              stats={[
                {
                  label: 'Unterbaugröße',
                  value: `${formatMeters(baseBoundingBox?.widthM ?? 0)} × ${formatMeters(baseBoundingBox?.depthM ?? 0)} m`,
                },
                { label: 'Gesamthöhe (ca.)', value: `${totalHeightCm} cm` },
                { label: 'Podeste gesamt', value: `${baseLayout.panels.length + topLayout.panels.length}` },
                { label: 'Füße gesamt', value: `${baseTotalFeet + topTotalFeet}` },
              ]}
            />
          )}

          {(resultTab === 'grundriss' || resultTab === '3d') && <FootColorLegend heights={[baseHeightCm, spindelHeightCm]} />}

          {resultTab === 'grundriss' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Unterbau</p>
                <FloorPlanSVG
                  layout={baseLayout}
                  feet={baseLabeledFeet}
                  heightCm={baseHeightCm}
                  minWidthM={Math.max(baseLayout.widthM, topLayout.widthM)}
                  showDimensions={showPlanDims}
                />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Thekenplatte (oben)</p>
                <FloorPlanSVG
                  layout={topLayout}
                  feet={topLabeledFeet}
                  heightCm={spindelHeightCm}
                  minWidthM={Math.max(baseLayout.widthM, topLayout.widthM)}
                  showDimensions={showPlanDims}
                />
              </div>
            </div>
          )}

          {/* AufbauScene3D bleibt unabhängig vom aktiven Tab immer gemountet — der PNG-Export
              braucht die live WebGL-Canvas-Referenz, die beim Unmounten verloren ginge. */}
          <div className={resultTab === '3d' ? '' : 'hidden'}>
            {/* Ausgeblendete Ebenen fehlen hier, bleiben aber als Referenz-Umriss im Editor der anderen Ebene. */}
            <AufbauScene3D
              tiers={[
                ...(effBaseView.hidden ? [] : [{ layout: baseLayout, feet: baseLabeledFeet, heightM: baseHeightCm / 100, panelColor: '#2c3e6b' }]),
                ...(effTopView.hidden
                  ? []
                  : [
                      {
                        layout: topLayout,
                        feet: topLabeledFeet,
                        heightM: spindelHeightCm / 100,
                        baseY: topBaseY,
                        offsetZ,
                        panelColor: '#c08a00',
                      },
                    ]),
              ]}
              onCanvasReady={onCanvasReady}
            />
            {effBaseView.hidden && effTopView.hidden && <p className="mt-2 text-sm text-[var(--color-text-muted)]">Alle Ebenen sind ausgeblendet.</p>}
          </div>

          {resultTab === 'material' && <MaterialListTable items={materialList} />}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Im Browser gespeichert</h2>
        <SavedConfigsPanel namespace="tresen" currentData={currentSavedState} onLoad={applyOwnState} />
      </section>
    </div>
  );
}
