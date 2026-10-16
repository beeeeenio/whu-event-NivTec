import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  findFreePosition,
  fitsAllAt,
  fitsAt,
  makePieceId,
  placeUnsnapped,
  rotatePieceInPlace,
  shiftPieces,
  type FilledPiece,
  type PlacementOptions,
  type Piece2D,
} from '../../domain/customShape';
import { checkGroupMove, duplicateWithOffset, moveGroupTo, nearestPieceInDirection, piecesInRect, rotateGroupAroundCenter, rotatePieceAroundCenter, snapGroupDelta, validatePieceEdit, withoutLocked, type GroupMoveCheck } from '../../domain/pieceOps';
import {
  getMemoryClipboard,
  makeClipboardPayload,
  parseClipboard,
  placeClipboard,
  serializeClipboard,
  setMemoryClipboard,
  type PiecesClipboardPayload,
} from '../../domain/clipboard';
import { alignmentGuides, nearestGaps, unionBounds, type Rect } from '../../domain/smartGuides';
import { isSondermassPiece, TRIANGLE_PANEL_SIZE_M } from '../../domain/panels';
import { triangleHand } from '../../domain/triangle';
import { rectInsideRoom, roomBlockers, type RoomPlan } from '../../domain/room';
import { mirrorPayload, payloadMatches, payloadSize, payloadToFilled, payloadToFilledPieces, rotatePayload, type ToolPayload } from '../../domain/toolPayload';
import { deleteBlock, listBlocks, saveBlock, selectionToBlock, subscribeBlocks, type SavedBlock } from '../../lib/blocks';
import { formatMeters } from '../../lib/format';
import { dragThresholdPx, isPrimaryButton, shouldRotateOnWheel, wheelIntent } from '../../lib/pointer';
import { createFrameThrottle } from '../../lib/pointerDrag';
import { panBy, pinchFactor, touchGestureIntent, viewBoxToString, zoomAt, zoomLevel, type ViewBox } from '../../lib/viewport';
import { editorShortcut, isEditableTarget } from '../../lib/shortcuts';
import { ACTION_BTN } from './editor/styles';
import { CanvasGrid } from './editor/CanvasGrid';
import { RoomLayer } from './editor/RoomLayer';
import { DragOverlay } from './editor/DragOverlay';
import { EditorToolbar } from './editor/EditorToolbar';
import { PiecePalette } from './editor/PiecePalette';
import { PieceShape } from './editor/PieceShape';
import { PieceInspector } from './editor/PieceInspector';
import { SelectionActionBar, type SelectionAction } from './editor/SelectionActionBar';
import { ShortcutHelp } from './editor/ShortcutHelp';
import { ZoomControls } from './editor/ZoomControls';
import type { DragState, PaletteDragState } from './editor/types';
import { usePointerDrag } from '../../hooks/usePointerDrag';
import { pruneSelection } from '../../lib/pieceLayerProps';
import { addAnnotation, removeAnnotation, SYMBOL_LABELS, type PlanAnnotation, type SymbolKind } from '../../domain/annotations';
import { AnnotationLayer } from './editor/AnnotationLayer';
import { DimensionChains } from './DimensionChains';

/** Rahmenauswahl in Metern (Start- und aktueller Punkt); additive = Umschalt beim Start, erweitert die Auswahl. */
interface MarqueeState {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  additive: boolean;
}

/** Abstand des Auswahlrahmens um die Gruppe (Meter). */
const SELECTION_FRAME_GAP_M = 0.06;
/** Meldung, wenn im Raum für ein Stück keine Stelle mehr frei ist (das Ablegen wird dann nicht ausgeführt). */
const ROOM_FULL_TEXT = 'Im Raum ist kein freier Platz für dieses Stück.';

interface Props {
  pieces: Piece2D[];
  onAddPieces: (pieces: FilledPiece[]) => void;
  /** Fügt Stücke mit bereits vergebenen IDs ein (ein Undo-Schritt) — nötig, um die Kopie danach auszuwählen. */
  onInsertPieces?: (pieces: Piece2D[]) => void;
  onRemovePiece: (id: string) => void;
  onMovePiece: (id: string, x: number, y: number) => void;
  /** Verschiebt mehrere Stücke gemeinsam um (dx, dy) — ein Undo-Schritt für die ganze Auswahl. */
  onMovePieces?: (ids: string[], dx: number, dy: number) => void;
  /** Entfernt mehrere Stücke — ein Undo-Schritt. */
  onRemovePieces?: (ids: string[]) => void;
  onRotatePiece: (id: string) => void;
  /** Ersetzt die ganze Stückliste in einem Undo-Schritt (Drehen um den Mittelpunkt, Vorlagen, Inspector). */
  onReplaceAll?: (next: Piece2D[]) => void;
  onMirrorPiece?: (id: string) => void;
  /** Verschiebt alle Stücke dieses Plans gemeinsam waagerecht um dx Meter ("Alles verschieben").
   *  Wird nur aufgerufen, wenn dabei nichts links über x=0 hinausrutscht (siehe shiftPieces). */
  onShiftAll: (dx: number) => void;
  /** Rückgängig/Wiederholen für diesen Plan — optional, damit die Komponente ohne Verlauf nutzbar bleibt. */
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Leert den ganzen Plan (ersetzt den bisherigen "Zurücksetzen"-Knopf im jeweiligen Modul). */
  onClear?: () => void;
  /** Zusätzlicher Inhalt im Leerzustand, z. B. Starter-Vorlagen. */
  emptyHint?: React.ReactNode;
  /** Bündelt mehrere Callback-Aufrufe zu einem Undo-Schritt. */
  onTransact?: (fn: () => void) => void;
  /** Beschriftung über der Kante, an der y=0 liegt (z.B. "Bühnenvorderkante"). */
  frontEdgeLabel?: string;
  /** Erzwingt eine Mindest-viewBox-Breite — z.B. damit zwei Ebenen (Tresen: Unterbau +
   *  Thekenplatte) dieselbe Skala teilen, statt unabhängig auf den eigenen Inhalt zu skalieren. */
  minCanvasWidthM?: number;
  /** Gestrichelter Referenz-Umriss einer anderen Fläche, an ihrer tatsächlichen Position (x,y) —
   *  NICHT pauschal an (0,0) verankert, sonst zeigt der Umriss eine Fläche, in der die echten
   *  Platten gar nicht liegen, sobald diese Ebene versetzt statt vorderkantenbündig gebaut wurde
   *  (siehe boundingBoxOf in customShape.ts). */
  referenceFootprint?: { x: number; y: number; widthM: number; depthM: number; label?: string };
  /** Raumkontur mit Hindernissen; Hindernisse und Außenbereich gelten als belegt. */
  room?: RoomPlan;
  /** Notizen, Symbole und Messlinien; ohne onAnnotationsChange nur Anzeige, ohne Beschriften-Menü. */
  annotations?: PlanAnnotation[];
  /** Ein Aufruf je Änderung — der Aufrufer legt sie in seine Undo-Historie. */
  onAnnotationsChange?: (next: PlanAnnotation[]) => void;
  /** Ganze Ebene gesperrt: nur Ansicht (Zoom, Maße), keine Bearbeitung. Nur Ansichtszustand, nicht in der Plan-Datei. */
  locked?: boolean;
  /** Nur-Lesen-Ansicht (geteilter Plan): zeigt den Plan, Zoom/Pan und Maße, aber keine Bearbeitung. */
  readOnly?: boolean;
}

/** Aktives Beschriften-Werkzeug: Messlinie, Textnotiz oder ein Symbol. null = keins. */
type AnnoTool = 'measure' | 'text' | { symbol: SymbolKind };
const SYMBOL_KINDS: SymbolKind[] = ['treppe', 'foh', 'notausgang'];
/** Maximale Länge einer Textnotiz (wie TEXT_MAX_LENGTH in domain/annotations.ts). */
const ANNO_TEXT_MAX = 200;
/** localStorage-Schlüssel für den Maßketten-Schalter ('1' = an). */
const SHOW_DIMS_STORAGE_KEY = 'nivtec:showDims';

const PAD = 0.6;
const MIN_CANVAS_WIDTH_M = 6;
const MIN_CANVAS_DEPTH_M = 4;
const BUFFER_M = 2;
const GRID_STEP_M = 0.5;
const NUDGE_LARGE_M = 1;
/** Kanten-Fangweite in Bildschirm-Pixeln; wird beim Platzieren und Verschieben in Meter umgerechnet. */
const SNAP_TOLERANCE_PX = 8;
const ARROW_DELTA: Partial<Record<string, [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Meter pro Bildschirm-Pixel über die Skalierung der CTM; ohne SVG-Box der Fallback 0,02. */
function metersPerPxOf(svg: SVGSVGElement | null): number {
  const ctm = svg?.getScreenCTM();
  return ctm && ctm.a ? 1 / ctm.a : 0.02;
}

/** Zwei-Finger-Geste, deren Abstand sich kaum ändert (|Faktor - 1| < 0,02), scrollt die Seite statt zu zoomen. */
const PINCH_SCROLL_TOLERANCE = 0.02;
/** Bewegung in Bildschirm-px, ab der ein Finger auf leerer Fläche als Wischen statt als Tippen gilt. */
const TAP_SLOP_PX = 10;

/** Die ersten beiden aktiven Berührungspunkte (Einfüge-Reihenfolge der Map), sonst null. */
function firstTwoTouches(points: Map<number, { x: number; y: number }>): [{ x: number; y: number }, { x: number; y: number }] | null {
  const it = points.values();
  const a = it.next();
  const b = it.next();
  if (a.done || b.done) return null;
  return [a.value, b.value];
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Beschriftungspunkte auf 0,05 m runden, nie negativ. */
function snapAnnoM(v: number): number {
  return Math.max(0, Math.round(v * 20) / 20);
}

const QUICK_WIDTHS = [2, 1.5, 1, 0.5] as const;

/** Entfernt Sperr-IDs von Stücken, die es nicht mehr gibt; gleiche Referenz, wenn nichts wegfällt. */
function pruneLocked(cur: Set<string>, pieces: readonly Piece2D[]): Set<string> {
  if (cur.size === 0) return cur;
  const existing = new Set(pieces.map((p) => p.id));
  if ([...cur].every((id) => existing.has(id))) return cur;
  return new Set([...cur].filter((id) => existing.has(id)));
}

/** Breite der schwebenden Aktionsleiste in px (für das Einklemmen am rechten Rand). */
const SELECTION_BAR_WIDTH_PX = 240;
/** Höhe der Aktionsleiste in px, für die Position über der Auswahl. */
const SELECTION_BAR_HEIGHT_PX = 44;

/** Stück nach n 90°-Drehungen (je rotatePieceInPlace): für den gedrehten Geist beim Ziehen. */
function rotatedBy(piece: Piece2D, turns: number): Piece2D {
  let r = piece;
  for (let i = 0; i < turns; i++) r = rotatePieceInPlace(r);
  return r;
}


/** Anzahl mit Wort: "1 Stück", sonst "n Stücke". */
function stueckeText(n: number): string {
  return n === 1 ? '1 Stück' : `${n} Stücke`;
}

/** Name eines Stücks für Screenreader (Roving-Focus und Tastatur-Sprung). */
function pieceAriaLabel(p: Piece2D, selected: boolean, locked: boolean): string {
  return `Podest ${formatMeters(p.w, 2)}×${formatMeters(p.d, 2)} m bei x=${formatMeters(p.x, 2)}, y=${formatMeters(p.y, 2)} m${selected ? ', ausgewählt' : ''}${locked ? ', gesperrt' : ''}`;
}

/** Kurzname eines aufgenommenen Werkzeugs für Ansagen. */
function payloadLabel(p: ToolPayload): string {
  if (p.kind === 'block') return `Baustein ${p.label}`;
  if (p.kind === 'viertelkreis') return 'Viertelkreis 1 m';
  const { w, d } = payloadSize(p);
  return `${p.kind === 'triangle' ? 'Dreieckpodest' : 'Stück'} ${formatMeters(w, 2)}×${formatMeters(d, 2)} m`;
}

export function PieceCanvasEditor({
  pieces,
  onAddPieces,
  onInsertPieces,
  onRemovePiece,
  onMovePiece,
  onMovePieces,
  onRemovePieces,
  onRotatePiece,
  onReplaceAll,
  onMirrorPiece,
  onShiftAll,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  emptyHint,
  onTransact,
  frontEdgeLabel = 'Vorderkante',
  minCanvasWidthM,
  referenceFootprint,
  room,
  annotations,
  onAnnotationsChange,
  locked = false,
  readOnly = false,
}: Props) {
  // Gesperrte Ebene oder Nur-Lesen-Ansicht: Palette, Beschriften, Bausteine, Inspector und Ändern-Schalter entfallen; Zoom und Maße bleiben.
  const editable = !readOnly && !locked;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  // Äußerer Container: Fokusprüfung für die Leertaste (Verschieben), siehe unten.
  const containerRef = useRef<HTMLDivElement>(null);
  // Relativer Wrapper um den Plan: Bezugsrahmen für die schwebende Aktionsleiste und den Drehen-Button.
  const wrapRef = useRef<HTMLDivElement>(null);
  // Ansicht, die während eines Ziehens (Stück, Palette, Verschieben) eingefroren ist — null = frei.
  const frozenBaseRef = useRef<ViewBox | null>(null);
  // Palette-Ziehen für das Mausrad-Fenster bzw. den nativen Listener (synchron, ohne Render dazwischen).
  const paletteDragRef = useRef<PaletteDragState | null>(null);
  // Letzte Mausposition über dem Plan — nur Ref, kein State: Ziel für Einfügen am Mauszeiger.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  // Aktuelle Stückliste für asynchrone Pfade (Rückfall-Timer beim Einfügen).
  const piecesRef = useRef(pieces);
  // Wurde das Einfügen schon über das paste-Ereignis erledigt? Dann greift der Rückfall-Timer nicht.
  const pasteHandledRef = useRef(false);
  const [armed, setArmedState] = useState<ToolPayload | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  // Alt gedrückt beim Platzieren: freie Lage ohne Einrasten, Überlappung wird rot angezeigt.
  const [altHeld, setAltHeld] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Gesperrte Stücke (nur Bearbeitungszustand): bleiben belegt, sind aber nicht auswähl- oder verschiebbar.
  const [lockedIds, setLockedIds] = useState<Set<string>>(() => new Set());
  // Beschriften: aktives Werkzeug, Startpunkt einer laufenden Messung, Zeiger für die Vorschau und gewählte Notiz.
  const [annoTool, setAnnoTool] = useState<AnnoTool | null>(null);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [annoPointer, setAnnoPointer] = useState<{ x: number; y: number } | null>(null);
  const [selectedAnnoId, setSelectedAnnoId] = useState<string | null>(null);
  // Maßketten (Außen- und Segmentmaße) dauerhaft einblenden; die Wahl bleibt pro Browser erhalten.
  const [showDims, setShowDims] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_DIMS_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  function toggleShowDims() {
    const next = !showDims;
    setShowDims(next);
    try {
      localStorage.setItem(SHOW_DIMS_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Speicher gesperrt (z. B. privates Fenster): die Anzeige gilt trotzdem für diese Sitzung.
    }
  }
  // Eigene Bausteine (localStorage, gilt für Kastenbühne und Tresen); liegen nie in der Plan-Datei.
  const [blocks, setBlocks] = useState<SavedBlock[]>(() => listBlocks());
  // Beide Tresen-Ebenen (und andere Tabs) sehen neu gespeicherte oder gelöschte Bausteine sofort.
  useEffect(() => subscribeBlocks(() => setBlocks(listBlocks())), []);
  // Stabile Liste für die memo-Palette: nur neu bauen, wenn sich die Bausteine ändern.
  const paletteBlocks = useMemo(
    () =>
      blocks.map((b) => {
        const payload: ToolPayload = { kind: 'block', label: b.name, pieces: b.pieces };
        return { key: b.id, label: b.name, payload, onDelete: () => setBlocks(deleteBlock(b.id)) };
      }),
    [blocks],
  );
  // Verschieben-Modus (Touch/Tastatur ohne Ziehen): danach wird das Ziel auf dem Plan angetippt.
  const [moveMode, setMoveMode] = useState(false);
  // Mehrfachauswahl per Antippen (Touch ohne Umschalttaste): Tippen fügt Stücke hinzu bzw. entfernt sie.
  const [multiSelect, setMultiSelect] = useState(false);
  // Undo/Redo oder Import können ausgewählte Stücke entfernen: IDs ohne Stück nicht festhalten.
  // Beim Wechsel der Stückliste direkt im Render nachziehen (kein Effekt, damit kein Zwischen-Render mit Geister-Auswahl entsteht).
  const [selectionPiecesRef, setSelectionPiecesRef] = useState(pieces);
  if (selectionPiecesRef !== pieces) {
    setSelectionPiecesRef(pieces);
    setSelectedIds((cur) => pruneSelection(cur, pieces));
    setLockedIds((cur) => pruneLocked(cur, pieces));
  }
  // Ohne Auswahl gibt es nichts zu verschieben: der Verschieben-Modus endet mit der Auswahl.
  if (moveMode && selectedIds.length === 0) setMoveMode(false);
  // Ebene wird gesperrt: laufendes Platzieren, Verschieben, Beschriften und Auswahl enden (beim Rendern nachgezogen).
  const [lockSeen, setLockSeen] = useState(editable);
  if (lockSeen !== editable) {
    setLockSeen(editable);
    if (!editable) {
      setArmedState(null);
      setMoveMode(false);
      setSelectedIds([]);
      setAnnoTool(null);
      setMeasureStart(null);
      setAnnoPointer(null);
      setSelectedAnnoId(null);
    }
  }
  // Einzelauswahl (Drehen/Spiegeln/Pfeiltasten) gilt nur bei genau einem ausgewählten Stück;
  // mit Umschalt+Klick lassen sich mehrere auswählen, die dann gemeinsam gelöscht werden.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  function setSelectedId(next: string | null | ((cur: string | null) => string | null)) {
    const value = typeof next === 'function' ? next(selectedId) : next;
    setSelectedIds(value === null ? [] : [value]);
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  // Stück unter der Maus (nur Maus/Stift): wird leicht hervorgehoben.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragState | null>(null);
  // Zoom/Ausschnitt des Plans in Metern; null = automatisch eingepasst (wie bisher).
  const [view, setView] = useState<ViewBox | null>(null);
  // Leertaste gehalten: Plan verschieben statt Stücke greifen.
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Eingefrorene Ansicht während eines Ziehens: State für den Render, Ref für die Listener (synchron, ohne Render dazwischen).
  const [frozenBase, setFrozenBaseState] = useState<ViewBox | null>(null);
  function setFrozenBase(v: ViewBox | null) {
    frozenBaseRef.current = v;
    setFrozenBaseState(v);
  }
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  // Barrierefreiheit: Ansage für Screenreader (aria-live), Stück mit Tastaturfokus (Fokusring) und DOM-Elemente der Stücke für den Fokus.
  const [announcement, setAnnouncement] = useState('');
  const [focusedPieceId, setFocusedPieceId] = useState<string | null>(null);
  const pieceElsRef = useRef(new Map<string, SVGElement>());
  // Position der Aktionsleiste über der Auswahl (Pixel relativ zum Wrapper), im Layout-Effect nachgeführt.
  const [barPos, setBarPos] = useState<{ left: number; top: number } | null>(null);
  // Rechtsklick öffnet die Leiste am Cursor; gilt nur, solange die Auswahl dieselbe Liste ist (Referenzgleichheit).
  const [barAtPointer, setBarAtPointer] = useState<{ left: number; top: number; ids: string[] } | null>(null);
  // Ein Button hat natives Klick-Verhalten, das nach einem echten Ziehen trotzdem feuert
  // (Pointer-Events und das nachfolgende `click` sind getrennte, aufeinanderfolgende Dinge,
  // auch bei Pointer-Capture). Ein Ref statt State, damit der Wert synchron und ohne
  // Render-Verzögerung im direkt danach feuernden `onClick` verfügbar ist.
  const suppressNextClickRef = useRef(false);
  // Stabile Callbacks für die memo-Palette: der Ref zeigt bei jedem Render auf die aktuellen Handler
  // (Zuweisung im useLayoutEffect vor dem return), die Callbacks selbst bleiben über alle Renders gleich.
  const paletteHandlersRef = useRef({
    down: handlePaletteButtonPointerDown,
    move: handlePaletteButtonPointerMove,
    up: handlePaletteButtonPointerUp,
    arm,
  });
  const paletteCallbacks = useMemo(
    () => ({
      onTilePointerDown: (e: React.PointerEvent<HTMLButtonElement>, p: ToolPayload) => paletteHandlersRef.current.down(e, p),
      onTilePointerMove: (e: React.PointerEvent<HTMLButtonElement>) => paletteHandlersRef.current.move(e),
      onTilePointerUp: (e: React.PointerEvent<HTMLButtonElement>) => paletteHandlersRef.current.up(e),
      onTileCancel: () => {
        setFrozenBase(null);
        setPaletteDrag(null);
      },
      onTileClick: (p: ToolPayload, isArmed: boolean) => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        paletteHandlersRef.current.arm(isArmed ? null : p);
      },
    }),
    [],
  );
  // Zeitpunkt (ms) der letzten Drehung per Mausrad, für die Drosselung während eines Paletten-Ziehens.
  const lastWheelRotateRef = useRef<number | null>(null);

  function arm(payload: ToolPayload | null) {
    setArmedState(payload);
    if (payload) announce(`${payloadLabel(payload)} aufgenommen – auf den Plan tippen oder Enter.`);
    setSelectedId(null);
    setPointerPos(null);
    setMoveMode(false);
    // Jedes Werkzeug (auch Stück-Bewaffnen und Abbrechen) beendet das Beschriften.
    setAnnoTool(null);
    setMeasureStart(null);
    setAnnoPointer(null);
  }

  // Auswahl einer Notiz endet, sobald Stücke ausgewählt werden — beim Rendern nachgezogen statt per Effect.
  const [selectionSeen, setSelectionSeen] = useState(selectedIds);
  if (selectionSeen !== selectedIds) {
    setSelectionSeen(selectedIds);
    if (selectedIds.length > 0) setSelectedAnnoId(null);
  }

  // Beschriften: Esc bricht ab, auch wenn der Fokus gerade nicht auf dem Plan liegt (z. B. im Auswahlmenü).
  const annoActive = annoTool !== null;
  useEffect(() => {
    if (!annoActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAnnoTool(null);
      setMeasureStart(null);
      setAnnoPointer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [annoActive]);

  // Notizen aus dem Aufrufer (leer, wenn keine übergeben ist) und die gerade gewählte Notiz; eine verschwundene ID zählt als nicht gewählt.
  const annoList = annotations ?? [];
  const selectedAnno = annoList.find((a) => a.id === selectedAnnoId) ?? null;
  const annoSelectValue = annoTool === null ? '' : typeof annoTool === 'string' ? annoTool : `symbol:${annoTool.symbol}`;

  // Auswahl im Beschriften-Menü: setzt das Werkzeug und beendet ein laufendes Platzieren von Stücken.
  function chooseAnnoTool(value: string) {
    arm(null);
    setSelectedAnnoId(null);
    if (value === 'measure' || value === 'text') setAnnoTool(value);
    else if (value.startsWith('symbol:')) setAnnoTool({ symbol: value.slice('symbol:'.length) as SymbolKind });
  }

  // Klick auf die Fläche mit aktivem Werkzeug: Notiz, Symbol bzw. Messpunkt anlegen. Nach dem Anlegen ist das Werkzeug aus.
  function handleAnnoToolClick(clientX: number, clientY: number) {
    if (!annoTool || !onAnnotationsChange) return;
    const raw = svgPointFromClient(clientX, clientY);
    const p = { x: snapAnnoM(raw.x), y: snapAnnoM(raw.y) };
    if (annoTool === 'text') {
      setAnnoTool(null);
      const text = (window.prompt('Notiz', '') ?? '').trim().slice(0, ANNO_TEXT_MAX);
      if (text) onAnnotationsChange(addAnnotation(annoList, { kind: 'text', x: p.x, y: p.y, text }));
      return;
    }
    if (annoTool === 'measure') {
      if (!measureStart) {
        setMeasureStart(p);
        return;
      }
      setAnnoTool(null);
      setMeasureStart(null);
      setAnnoPointer(null);
      if (p.x !== measureStart.x || p.y !== measureStart.y) {
        onAnnotationsChange(addAnnotation(annoList, { kind: 'measure', x1: measureStart.x, y1: measureStart.y, x2: p.x, y2: p.y }));
      }
      return;
    }
    setAnnoTool(null);
    onAnnotationsChange(addAnnotation(annoList, { kind: 'symbol', symbol: annoTool.symbol, x: p.x, y: p.y }));
  }

  // Vorschau der Messlinie vom Startpunkt zum Zeiger (nur während einer laufenden Messung).
  const measurePreview: PlanAnnotation | null =
    annoTool === 'measure' && measureStart && annoPointer
      ? { id: 'vorschau', kind: 'measure', x1: measureStart.x, y1: measureStart.y, x2: snapAnnoM(annoPointer.x), y2: snapAnnoM(annoPointer.y) }
      : null;

  // Ausgewählte Notiz entfernen (Entf oder Schalter "Notiz entfernen"); ein Undo-Schritt über den Aufrufer.
  function removeSelectedAnno() {
    if (!selectedAnno || !onAnnotationsChange) return;
    onAnnotationsChange(removeAnnotation(annoList, selectedAnno.id));
    setSelectedAnnoId(null);
  }

  // Klick auf eine Notiz (ohne aktives Werkzeug) wählt sie aus und hebt die Stück-Auswahl auf.
  function selectAnno(id: string) {
    setSelectedIds([]);
    setSelectedAnnoId(id);
  }

  // Ein laufender Timer wird vor jedem neuen Hinweis verworfen, damit die zweite Meldung
  // volle 2,5 s stehen bleibt und der alte Timer sie nicht vorzeitig ausblendet.
  const blockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showBlockedMessage(text: string) {
    setBlockedMessage(text);
    if (blockedTimerRef.current) clearTimeout(blockedTimerRef.current);
    blockedTimerRef.current = setTimeout(() => {
      blockedTimerRef.current = null;
      setBlockedMessage(null);
    }, 2500);
  }
  useEffect(() => () => {
    if (blockedTimerRef.current) clearTimeout(blockedTimerRef.current);
  }, []);

  // Ansage für Screenreader: erst leeren, dann im nächsten Frame setzen, damit ein gleicher Text erneut angekündigt wird.
  function announce(text: string) {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }

  // "Plan geleert"-Snackbar mit Rückgängig: verschwindet nach 6 s, nach Rückgängig und sobald wieder
  // Stücke auf dem Plan liegen. Der Timer läuft wie blockedTimerRef über ein Ref und wird beim Unmount aufgeräumt.
  const [clearedSnack, setClearedSnack] = useState(false);
  const clearedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleClear() {
    onClear?.();
    setSelectedIds([]);
    arm(null);
    setClearedSnack(true);
    if (clearedTimerRef.current) clearTimeout(clearedTimerRef.current);
    clearedTimerRef.current = setTimeout(() => {
      clearedTimerRef.current = null;
      setClearedSnack(false);
    }, 6000);
  }
  useEffect(() => () => {
    if (clearedTimerRef.current) clearTimeout(clearedTimerRef.current);
  }, []);
  // Sobald wieder Stücke liegen, verschwindet die Snackbar – beim Rendern nachgezogen statt per Effect.
  const [lastPieceCount, setLastPieceCount] = useState(pieces.length);
  if (lastPieceCount !== pieces.length) {
    setLastPieceCount(pieces.length);
    if (pieces.length > 0) setClearedSnack(false);
  }

  // Raum-Hindernisse und Außenbereich (nur mit room) gelten wie belegte Stücke; die Stückliste selbst bleibt `pieces`.
  const blockers = useMemo(() => roomBlockers(room), [room]);
  const occupied = useMemo(() => [...pieces, ...blockers], [pieces, blockers]);
  const contentWidthM = Math.max(
    pieces.reduce((m, p) => Math.max(m, p.x + p.w), 0),
    referenceFootprint ? referenceFootprint.x + referenceFootprint.widthM : 0,
    room ? room.widthM : 0,
  );
  const contentDepthM = Math.max(
    pieces.reduce((m, p) => Math.max(m, p.y + p.d), 0),
    referenceFootprint ? referenceFootprint.y + referenceFootprint.depthM : 0,
    room ? room.depthM : 0,
  );
  const canvasWidthM = Math.max(minCanvasWidthM ?? 0, MIN_CANVAS_WIDTH_M, contentWidthM + BUFFER_M);
  const canvasDepthM = Math.max(MIN_CANVAS_DEPTH_M, contentDepthM + BUFFER_M);
  // Ausgangsausschnitt (ganzer Plan mit Rand). Während eines Ziehens bleibt er eingefroren, damit die Ansicht nicht springt.
  const baseView: ViewBox = { x: -PAD, y: -PAD, w: canvasWidthM + PAD * 2, h: canvasDepthM + PAD * 2 };
  const effectiveBase = frozenBase ?? baseView;
  const viewBox = viewBoxToString(view ?? effectiveBase);
  const zoomPercent = Math.round(zoomLevel(view ?? effectiveBase, effectiveBase) * 100);
  // Aktuelle Werte für den nativen Mausrad-Listener (wird einmal registriert).
  const baseRef = useRef(baseView);

  /**
   * Wandelt einen Bildschirmpunkt exakt in viewBox-Koordinaten (Meter) um, über die
   * Bildschirm-CTM der SVG. Wichtig: die SVG skaliert per preserveAspectRatio (Standard
   * "xMidYMid meet") innerhalb von w-full/max-h — bei abweichendem Seitenverhältnis entsteht
   * Letter-/Pillarboxing, wodurch ein naiver Bounding-Rect-Bruchteil falsche Koordinaten
   * liefern würde. getScreenCTM() berücksichtigt das automatisch korrekt — auch für Punkte
   * weit außerhalb der SVG-eigenen Box (reine Koordinatentransformation, kein Clipping),
   * wichtig für das Ziehen aus der Palette, bevor der Cursor den Canvas erreicht hat.
   */
  function svgPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  // Meter pro Bildschirm-Pixel. Der Wert wird aus dem DOM gemessen und im State gehalten, damit der
  // Render nie an svgRef liest. Vor der ersten Messung gilt der Fallback 0,02 (siehe metersPerPxOf).
  const [metersPerPx, setMetersPerPx] = useState(0.02);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Neu messen, wenn sich die Größe des <svg> ändert oder die Viewbox wächst (Inhalt).
    const measure = () => setMetersPerPx(metersPerPxOf(svg));
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [viewBox]);

  // Fangweite für Kanten in Metern, damit sie unabhängig vom Zoom etwa 8 Bildschirm-px entspricht.
  function placementOptions(): PlacementOptions {
    return { snapToleranceM: SNAP_TOLERANCE_PX * metersPerPx };
  }

  // Platzsuche gegen belegte Flächen (Stücke und Raum). Liegt die gefundene Lage außerhalb des Raums
  // (voller Raum), ist sie ungültig: dann wird nichts abgelegt bzw. rot gezeigt, nie ein Stück weit außen.
  function snappedPlacement(w: number, d: number, desiredX: number, desiredY: number, excludeId?: string, options?: PlacementOptions): { x: number; y: number; valid: boolean } {
    const pos = findFreePosition(occupied, w, d, desiredX, desiredY, excludeId, options);
    return { ...pos, valid: rectInsideRoom({ x: pos.x, y: pos.y, w, d }, room) };
  }

  // Bedient sowohl den Klick-Bewaffnen-Hover als auch das Ziehen aus der Palette (sobald der
  // Cursor über dem Canvas ist) — eine einzige Vorschau-Quelle für beide Wege.
  function previewForPayload(payload: ToolPayload | null): (FilledPiece & { valid?: boolean })[] | null {
    if (!payload || !pointerPos) return null;
    if (payload.kind === 'block') {
      // Baustein: ohne Einrasten an Kanten, sondern als Ganzes am Anker; Kollision wird rot angezeigt.
      const anchor = blockAnchor(payload, pointerPos, altHeld);
      const filled = payloadToFilledPieces(payload, anchor.x, anchor.y);
      const valid = fitsAllAt(occupied, filled);
      return filled.map((f) => ({ ...f, valid }));
    }
    const { w, d } = payloadSize(payload);
    if (altHeld) {
      const free = placeUnsnapped(occupied, w, d, pointerPos.x - w / 2, pointerPos.y - d / 2);
      return [{ ...payloadToFilled(payload, free.x, free.y), valid: free.valid }];
    }
    // Außerhalb des Raums (voller Raum) rot statt als gültige Vorschau.
    const pos = snappedPlacement(w, d, pointerPos.x - w / 2, pointerPos.y - d / 2, undefined, placementOptions());
    return [{ ...payloadToFilled(payload, pos.x, pos.y), valid: pos.valid }];
  }

  // arm(null) beim Start eines Paletten-Ziehens sorgt dafür, dass armed/paletteDrag nie
  // gleichzeitig aktiv sind — das `??` ist defensiv, nicht tragend.
  const activePayload = armed ?? (paletteDrag?.overCanvas ? paletteDrag.payload : null);
  const previewPieces = previewForPayload(activePayload);

  // Smart Guides: Live-Fläche des gerade bewegten oder platzierten Einzelstücks. Beim Ziehen eines
  // Einzelstücks ist es das Ziel, sonst das Vorschau-Stück. Gruppen-Drag zeigt bewusst keine Guides.
  // Während des Ziehens gedreht: Geist, Maße und Smart Guides nutzen die gedrehten Maße des Stücks.
  const shownPieces = drag?.rotations && !drag.group ? pieces.map((p) => (p.id === drag.id ? rotatedBy(p, drag.rotations ?? 0) : p)) : pieces;
  const draggedPiece = drag?.moved && drag.target && !drag.group ? shownPieces.find((p) => p.id === drag.id) ?? null : null;
  const previewSingle = previewPieces?.length === 1 ? previewPieces[0] : null;
  const liveRect: Rect | null =
    draggedPiece && drag?.target
      ? { x: drag.target.x, y: drag.target.y, w: draggedPiece.w, d: draggedPiece.d }
      : previewSingle
        ? { x: previewSingle.x, y: previewSingle.y, w: previewSingle.w, d: previewSingle.d }
        : null;
  const others = liveRect ? shownPieces.filter((p) => !(draggedPiece && p.id === draggedPiece.id)) : [];
  // Raum-Hindernisse sind Nachbarn für Hilfslinien und Abstände; das Gesamtmaß (total) bleibt bei den Stücken.
  const guideNeighbors = room ? [...others, ...room.obstacles] : others;
  const liveGeometry = liveRect
    ? {
        guides: alignmentGuides(liveRect, guideNeighbors),
        gaps: nearestGaps(liveRect, guideNeighbors),
        total: others.length > 0 ? unionBounds([...others, liveRect]) : null,
        px: metersPerPx,
      }
    : null;

  // Reine Platzier-Funktion ohne Seiteneffekt auf armed/paletteDrag — das bleibt Sache der
  // Aufrufer (Klick-Platzieren-Pfad, Paletten-Ziehen UND Tastatur-Platzieren nutzen dieselbe
  // Logik, nur die Umrechnung von Bildschirm- zu Meter-Koordinaten unterscheidet sich).
  // free=true (Alt): ohne Einrasten an der freien Lage; liegt sie auf einem anderen Stück, wird nichts abgelegt.
  function commitPayloadAtPoint(payload: ToolPayload, pos: { x: number; y: number }, free = false) {
    if (payload.kind === 'block') {
      const anchor = blockAnchor(payload, pos, free);
      const filled = payloadToFilledPieces(payload, anchor.x, anchor.y);
      if (!fitsAllAt(occupied, filled)) {
        showBlockedMessage('Dort ist kein Platz für den Baustein – nichts platziert.');
        return;
      }
      // Ein Baustein ist ein einziger Schritt für Rückgängig, egal wie viele Stücke er hat.
      onAddPieces(filled);
      announce(`${payloadLabel(payload)} platziert bei x=${formatMeters(anchor.x, 2)}, y=${formatMeters(anchor.y, 2)} m.`);
      return;
    }
    const { w, d } = payloadSize(payload);
    if (free) {
      const exact = placeUnsnapped(occupied, w, d, pos.x - w / 2, pos.y - d / 2);
      if (!exact.valid) {
        showBlockedMessage('Dort ist kein Platz – nichts platziert.');
        return;
      }
      onAddPieces([payloadToFilled(payload, exact.x, exact.y)]);
      announce(`${payloadLabel(payload)} platziert bei x=${formatMeters(exact.x, 2)}, y=${formatMeters(exact.y, 2)} m.`);
      return;
    }
    const target = snappedPlacement(w, d, pos.x - w / 2, pos.y - d / 2, undefined, placementOptions());
    if (!target.valid) {
      showBlockedMessage(ROOM_FULL_TEXT);
      return;
    }
    onAddPieces([payloadToFilled(payload, target.x, target.y)]);
    announce(`${payloadLabel(payload)} platziert bei x=${formatMeters(target.x, 2)}, y=${formatMeters(target.y, 2)} m.`);
  }

  function commitPayloadAt(payload: ToolPayload, clientX: number, clientY: number, free = false) {
    commitPayloadAtPoint(payload, svgPointFromClient(clientX, clientY), free);
  }

  // Anker eines Bausteins: links/oben nie über 0, auf das 0,5-m-Raster gerastet; mit Alt auf cm statt Raster.
  // Ohne findFreePosition: der Baustein sitzt genau dort, wo er gezeigt wird.
  function blockAnchor(payload: ToolPayload, pos: { x: number; y: number }, fine: boolean): { x: number; y: number } {
    const { w, d } = payloadSize(payload);
    const snap = (v: number) => (fine ? Math.round(v * 100) / 100 : Math.round(v / GRID_STEP_M) * GRID_STEP_M);
    return { x: Math.max(0, snap(pos.x - w / 2)), y: Math.max(0, snap(pos.y - d / 2)) };
  }

  // Eigener Baustein: die aktuelle Auswahl wird unter einem Namen gespeichert und erscheint in der Palette.
  function saveSelectionAsBlock() {
    const name = window.prompt('Name des Bausteins', `Baustein ${blocks.length + 1}`)?.trim();
    if (!name) return;
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36);
    const block = selectionToBlock(pieces, selectedIds, name, id);
    if (!block) return;
    setBlocks(saveBlock(block));
  }

  function handlePaletteButtonPointerDown(e: React.PointerEvent<HTMLButtonElement>, payload: ToolPayload) {
    if (!isPrimaryButton(e)) return;
    suppressNextClickRef.current = false;
    arm(null);
    setFrozenBase(baseView);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // best-effort, siehe bestehendes Muster bei handlePiecePointerDown
    }
    setPaletteDrag({ payload, pointerType: e.pointerType, startClientX: e.clientX, startClientY: e.clientY, moved: false, overCanvas: false });
  }

  function handlePaletteButtonPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!paletteDrag) return;
    setAltHeld(e.altKey);
    if (Math.hypot(e.clientX - paletteDrag.startClientX, e.clientY - paletteDrag.startClientY) < dragThresholdPx(paletteDrag.pointerType)) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const overCanvas = !!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (overCanvas) setPointerPos(svgPointFromClient(e.clientX, e.clientY));
    setPaletteDrag((d) => (d ? { ...d, moved: true, overCanvas } : d));
  }

  function handlePaletteButtonPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const pd = paletteDrag;
    setPaletteDrag(null);
    setFrozenBase(null);
    if (!pd?.moved) return; // kein echtes Ziehen: der nachfolgende native `click` armt wie bisher
    suppressNextClickRef.current = true;
    if (pd.overCanvas) commitPayloadAt(pd.payload, e.clientX, e.clientY, e.altKey);
    arm(null);
  }

  // Drehen, während ein Stück noch aus der Palette gezogen wird (vor dem Loslassen) — der
  // Button behält seinen Fokus über die ganze Zieh-Geste (Pointer-Capture ändert daran nichts),
  // daher reicht ein normaler onKeyDown hier.
  function rotatePaletteDrag() {
    setPaletteDrag((d) => (d ? { ...d, payload: rotatePayload(d.payload) } : d));
  }

  // Fensterweit statt nur am Button: Safari fokussiert Buttons beim Klick nicht, daher kam R dort
  // nie an. Zusätzlich dreht ein Rechtsklick/Mausrad das gezogene Stück sofort.
  const dragging = paletteDrag !== null;
  useEffect(() => {
    if (!dragging) return;
    lastWheelRotateRef.current = null;
    const onKey = (e: KeyboardEvent) => {
      // Esc bricht das Paletten-Ziehen ab. suppressNextClickRef verhindert, dass der danach
      // folgende click die Kachel bewaffnet; der nächste pointerdown setzt den Ref zurück.
      if (e.key === 'Escape') {
        e.preventDefault();
        suppressNextClickRef.current = true;
        setFrozenBase(null);
        setPaletteDrag(null);
        setPointerPos(null);
        return;
      }
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      rotatePaletteDrag();
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      rotatePaletteDrag();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Reines Rad dreht das Stück; Strg/Cmd+Rad wird nur verworfen (kein Zoom während des Ziehens).
      if (wheelIntent(e, { paletteDragging: true }) !== 'rotate') return;
      const now = performance.now();
      if (!shouldRotateOnWheel(e, now, lastWheelRotateRef.current)) return;
      lastWheelRotateRef.current = now;
      rotatePaletteDrag();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('wheel', onWheel);
    };
  }, [dragging]);

  const pieceDragging = drag !== null;

  // Alt-Taste beim Platzieren (Klick-Werkzeug oder Paletten-Ziehen): fensterweit beobachtet, damit
  // Alt auch ankommt, wenn der Cursor gerade nicht über dem Plan ist. Alt allein würde unter Windows
  // die Menüleiste öffnen — daher preventDefault beim Drücken.
  // Auch beim Ziehen eines Stücks, damit Alt dort nicht die Menüleiste öffnet.
  const placing = armed !== null || paletteDrag !== null || pieceDragging;
  useEffect(() => {
    if (!placing) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      e.preventDefault();
      setAltHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      setAltHeld(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      setAltHeld(false);
    };
  }, [placing]);

  // Leertaste gedrückt halten = Plan verschieben. Nur wenn der Plan den Fokus hat und kein Werkzeug bewaffnet ist
  // (sonst platziert die Leertaste wie bisher). Die Taste wird am Fenster abgefangen, damit die Seite nicht scrollt
  // und ein fokussierter Schalter nicht auslöst; Eingabefelder bleiben unberührt.
  const spaceGrabRef = useRef(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' || armed || isEditableTarget(e.target)) return;
      // Plan fokussiert, oder Mauszeiger über dem Plan (dann auch bei fokussiertem Schalter im Editor bzw. ohne Fokus).
      // Sonst löst die Leertaste einen fokussierten Schalter (Palette, Toolbar) wie gewohnt aus.
      const active = document.activeElement;
      const planFocused = active !== null && active === svgRef.current;
      const overPlan =
        lastPointerRef.current !== null && (active === document.body || !!containerRef.current?.contains(active));
      if (!planFocused && !overPlan) return;
      e.preventDefault();
      spaceGrabRef.current = true;
      setSpaceHeld(true);
    };
    // keyup nur, wenn wir das keydown abgefangen haben – sonst löst ein fokussierter Schalter normal aus.
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !spaceGrabRef.current) return;
      e.preventDefault();
      spaceGrabRef.current = false;
      setSpaceHeld(false);
    };
    const onBlur = () => {
      spaceGrabRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [armed]);

  // Mausrad am Plan: Strg/Cmd+Rad (und Trackpad-Pinch) zoomt zum Mauszeiger, das reine Rad scrollt die Seite.
  // Nativer Listener mit passive:false, damit preventDefault wirkt (React-onWheel ist passiv).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const intent = wheelIntent(e, { paletteDragging: paletteDragRef.current !== null });
      if (intent === 'scroll') return;
      e.preventDefault();
      // Während eines Ziehens bleibt die Ansicht stehen (Stück, Palette oder Verschieben).
      if (intent !== 'zoom' || frozenBaseRef.current !== null) return;
      // Zeilen- bzw. Seitenmaß (Firefox) auf Pixel umrechnen, damit die Zoomstufen gleich groß bleiben.
      const deltaPx = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const factor = Math.exp(-deltaPx * 0.002);
      const focus = svgPointFromClient(e.clientX, e.clientY);
      setView((v) => zoomAt(v ?? baseRef.current, baseRef.current, factor, focus));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Ziehen platzierter Stücke läuft über den Hook (Schwelle je Zeigertyp, Pointer-Capture, Esc, pointercancel).
  // dragRef spiegelt den DragState synchron: Zieh-Updates rechnen gegen den letzten Wert statt gegen den
  // React-State, und gerendert wird höchstens einmal je Frame über dragThrottle.
  const dragRef = useRef<DragState | null>(null);
  const dragThrottle = useMemo(() => createFrameThrottle<DragState | null>((v) => setDrag(v)), []);
  useEffect(() => () => dragThrottle.cancel(), [dragThrottle]);

  // Abbruch eines laufenden Ziehens (Esc, pointercancel, verlorene Pointer-Capture): nur verwerfen,
  // nichts committen, daher kein Undo-Schritt. lostpointercapture feuert erst nach pointerup, das
  // bereits committet hat — dort ist das Aufräumen nur noch harmlos.
  function cancelPieceDrag() {
    const wasMoving = dragRef.current?.moved === true;
    dragThrottle.cancel();
    dragRef.current = null;
    setDrag(null);
    setFrozenBase(null);
    if (wasMoving) announce('Ziehen abgebrochen.');
  }

  // Mehrere Callback-Aufrufe als ein Undo-Schritt (fällt ohne onTransact auf direkten Aufruf zurück).
  function batch(fn: () => void) {
    if (onTransact) onTransact(fn);
    else fn();
  }

  // Drehen-Button während eines Touch-Ziehens: dreht den Geist um 90° und hält das Ziel um dessen Mitte.
  // Die Ablage passiert erst beim Loslassen (onEnd), damit das Ganze ein Undo-Schritt bleibt.
  function rotateDraggedPiece() {
    const cur = dragRef.current;
    if (!cur || cur.group || !cur.target) return;
    const piece = pieces.find((p) => p.id === cur.id);
    if (!piece) return;
    const turns = ((cur.rotations ?? 0) + 1) % 4;
    const before = rotatedBy(piece, cur.rotations ?? 0);
    const after = rotatedBy(piece, turns);
    const cx = cur.target.x + before.w / 2;
    const cy = cur.target.y + before.d / 2;
    const ox = cx - after.w / 2;
    const oy = cy - after.d / 2;
    const target =
      cur.target.valid === false
        ? placeUnsnapped(occupied, after.w, after.d, ox, oy, piece.id)
        : snappedPlacement(after.w, after.d, ox, oy, piece.id, placementOptions());
    const next: DragState = { ...cur, rotations: turns, target };
    dragRef.current = next;
    dragThrottle.push(next);
  }

  // Der Greif-Offset bleibt erhalten: das Stück springt nicht mit der Mitte an den Cursor.
  const pieceDrag = usePointerDrag<Piece2D>({
    onStart: (e, piece) => {
      if (armed || moveMode) return false;
      e.stopPropagation();
      if (e.shiftKey) {
        setSelectedIds((cur) => (cur.includes(piece.id) ? cur.filter((id) => id !== piece.id) : [...cur, piece.id]));
        return false;
      }
      // Mehrfachauswahl (Touch): ein noch nicht ausgewähltes Stück kommt nur dazu, es wird nicht gezogen.
      if (multiSelect && !selectedIds.includes(piece.id)) {
        setSelectedIds((cur) => [...cur, piece.id]);
        return false;
      }
      const inGroup = selectedIds.length > 1 && selectedIds.includes(piece.id);
      const start = svgPointFromClient(e.clientX, e.clientY);
      const next: DragState = {
        id: piece.id,
        moved: false,
        target: null,
        grabOffset: { x: start.x - piece.x, y: start.y - piece.y },
        group: inGroup ? { startX: start.x, startY: start.y, dx: 0, dy: 0, valid: true } : undefined,
        pointerType: e.pointerType,
      };
      dragRef.current = next;
      setDrag(next);
      setFrozenBase(baseView);
      return true;
    },
    onMove: (e, _session, piece) => {
      const cur = dragRef.current;
      if (!cur) return;
      const { x, y } = svgPointFromClient(e.clientX, e.clientY);
      let next: DragState;
      if (cur.group) {
        let dx: number;
        let dy: number;
        if (e.altKey) {
          // Mit Alt ungerastert, nur auf cm gerundet – und nie links/oben über den Plan hinaus.
          const moving = pieces.filter((p) => selectedIds.includes(p.id));
          const minX = Math.min(...moving.map((p) => p.x));
          const minY = Math.min(...moving.map((p) => p.y));
          dx = Math.max(-minX, Math.round((x - cur.group.startX) * 100) / 100);
          dy = Math.max(-minY, Math.round((y - cur.group.startY) * 100) / 100);
        } else {
          // Einrasten an Kanten der übrigen Stücke, sonst aufs Raster.
          ({ dx, dy } = snapGroupDelta(pieces, selectedIds, x - cur.group.startX, y - cur.group.startY, SNAP_TOLERANCE_PX * metersPerPx, GRID_STEP_M, blockers));
        }
        const valid = checkGroupMove(pieces, selectedIds, dx, dy, blockers) === 'ok';
        if (cur.moved && cur.group.dx === dx && cur.group.dy === dy && cur.group.valid === valid) return;
        if (!cur.moved) announce(`${stueckeText(selectedIds.length)} aufgenommen. Loslassen legt ab, Esc bricht ab.`);
        next = { ...cur, moved: true, group: { ...cur.group, dx, dy, valid } };
      } else {
        // Mit gedrehten Maßen rechnen (Drehen während des Ziehens, siehe rotateDraggedPiece).
        const shape = rotatedBy(piece, cur.rotations ?? 0);
        const target = e.altKey
          ? placeUnsnapped(occupied, shape.w, shape.d, x - cur.grabOffset.x, y - cur.grabOffset.y, piece.id)
          : snappedPlacement(shape.w, shape.d, x - cur.grabOffset.x, y - cur.grabOffset.y, piece.id, placementOptions());
        if (cur.moved && cur.target && cur.target.x === target.x && cur.target.y === target.y && cur.target.valid === target.valid) return;
        if (!cur.moved) {
          const sz = rotatedBy(piece, cur.rotations ?? 0);
          announce(`Stück ${formatMeters(sz.w, 2)}×${formatMeters(sz.d, 2)} m aufgenommen. Loslassen legt ab, Esc bricht ab.`);
        }
        next = { ...cur, moved: true, target };
      }
      dragRef.current = next;
      dragThrottle.push(next);
    },
    onEnd: (_e, session, piece) => {
      const cur = dragRef.current;
      dragThrottle.cancel();
      setDrag(null);
      dragRef.current = null;
      setFrozenBase(null);
      if (!cur) return;
      // Mehrfachauswahl: ein Tippen ohne Bewegung nimmt das Stück wieder aus der Auswahl.
      if (!cur.moved && multiSelect) {
        setSelectedIds((c) => c.filter((id) => id !== piece.id));
        return;
      }
      if (cur.group) {
        const { dx, dy, valid } = cur.group;
        if (cur.moved && valid && (dx !== 0 || dy !== 0)) {
          if (onMovePieces) onMovePieces(selectedIds, dx, dy);
          else batch(() => pieces.filter((p) => selectedIds.includes(p.id)).forEach((p) => onMovePiece(p.id, round1(p.x + dx), round1(p.y + dy))));
        } else if (cur.moved && !valid) {
          showBlockedMessage('Dort ist kein Platz – die Auswahl würde andere Stücke überlappen. Nichts verschoben.');
        }
        if (cur.moved && valid) {
          const moving = pieces.filter((p) => selectedIds.includes(p.id));
          const gx = Math.min(...moving.map((p) => p.x)) + dx;
          const gy = Math.min(...moving.map((p) => p.y)) + dy;
          announce(`Abgelegt bei x=${formatMeters(gx, 2)}, y=${formatMeters(gy, 2)} m.`);
        }
      } else if (cur.moved && cur.target?.valid === false) {
        // Außerhalb des Raums (voller Raum): eigene Meldung, sonst das Überlappen mit einem anderen Stück.
        const sz = rotatedBy(piece, cur.rotations ?? 0);
        const inRoom = rectInsideRoom({ x: cur.target.x, y: cur.target.y, w: sz.w, d: sz.d }, room);
        showBlockedMessage(inRoom ? 'Dort ist kein Platz – das Stück würde ein anderes überlappen. Nichts verschoben.' : ROOM_FULL_TEXT);
      } else if (cur.moved && cur.target) {
        const { x: tx, y: ty } = cur.target;
        const turns = cur.rotations ?? 0;
        // Gedreht abgelegt ist ein einziger Undo-Schritt: mit onReplaceAll ein Ersatz, sonst gebündelt verschieben und drehen.
        if (turns > 0 && onReplaceAll) {
          onReplaceAll(pieces.map((q) => (q.id === piece.id ? { ...rotatedBy(piece, turns), x: tx, y: ty } : q)));
        } else if (turns > 0) {
          batch(() => {
            onMovePiece(piece.id, tx, ty);
            for (let i = 0; i < turns; i++) onRotatePiece(piece.id);
          });
        } else {
          onMovePiece(piece.id, tx, ty);
        }
        announce(`Abgelegt bei x=${formatMeters(tx, 2)}, y=${formatMeters(ty, 2)} m.`);
        setSelectedId(piece.id);
      } else if (!session.moved) {
        setSelectedId((c) => (c === piece.id ? null : piece.id));
      }
    },
    onCancel: cancelPieceDrag,
  });

  // Verschieben des Ausschnitts: Leertaste+Ziehen oder mittlere Maustaste. Läuft als eigene Zieh-Sitzung am svg
  // (siehe onPointerDownCapture); die Ansicht friert dabei ein wie beim Stück-Ziehen.
  const panStartViewRef = useRef<ViewBox | null>(null);
  const panDrag = usePointerDrag<null>(
    {
      onStart: () => {
        panStartViewRef.current = view ?? effectiveBase;
        setFrozenBase(baseView);
      },
      onMove: (e, s) => {
        // Gegen den Ausschnitt beim Start und den Startpunkt rechnen: so geht auch die Strecke bis zur
        // Zieh-Schwelle nicht verloren und der Plan bleibt exakt unter dem Zeiger.
        const startView = panStartViewRef.current;
        if (!startView) return;
        const k = metersPerPxOf(svgRef.current);
        setView(panBy(startView, -(e.clientX - s.startX) * k, -(e.clientY - s.startY) * k));
      },
      onEnd: () => {
        setFrozenBase(null);
      },
      onCancel: () => {
        setFrozenBase(null);
      },
    },
    { allowButtons: [0, 1] },
  );
  const panHandlers = panDrag.bind(null);

  // Rahmenauswahl mit Maus oder Stift (Touch scrollt die Seite, siehe handleTouchDown). Start und Ende im Ref,
  // der State dient nur dem Render des Rahmens.
  const [marquee, setMarqueeState] = useState<MarqueeState | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);
  function setMarquee(next: MarqueeState | null) {
    marqueeRef.current = next;
    setMarqueeState(next);
  }
  const marqueeDrag = usePointerDrag<null>({
    onStart: (e) => {
      if (e.pointerType === 'touch') return false;
      const start = svgPointFromClient(e.clientX, e.clientY);
      setMarquee({ x0: start.x, y0: start.y, x1: start.x, y1: start.y, additive: e.shiftKey });
    },
    onMove: (e) => {
      const cur = marqueeRef.current;
      if (!cur) return;
      const p = svgPointFromClient(e.clientX, e.clientY);
      setMarquee({ ...cur, x1: p.x, y1: p.y });
    },
    onEnd: (e, s) => {
      const cur = marqueeRef.current;
      setMarquee(null);
      if (!cur) return;
      // Klick ohne Bewegung auf leerer Fläche: Auswahl aufheben (mit Umschalt bleibt sie).
      if (!s.moved) {
        setSelectedAnnoId(null);
        if (!cur.additive) setSelectedIds([]);
        return;
      }
      const p = svgPointFromClient(e.clientX, e.clientY);
      const ids = withoutLocked(piecesInRect(pieces, { x: cur.x0, y: cur.y0, w: p.x - cur.x0, d: p.y - cur.y0 }, 'intersect'), lockedIds);
      setSelectedIds(cur.additive ? [...selectedIds, ...ids.filter((id) => !selectedIds.includes(id))] : ids);
    },
    onCancel: () => setMarquee(null),
  });

  // Touch-Gesten am Plan (Entscheidung je Berührung in touchGestureIntent): aktive Berührungspunkte
  // (pointerId → Position in client-px), laufende Zwei-Finger-Geste und Wischen auf leerer Fläche.
  // touch-action bleibt am svg auf none, daher scrollt die Seite hier selbst über window.
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; mid: { x: number; y: number }; cumFactor: number; zoomed: boolean } | null>(null);
  const touchScrollRef = useRef<{ id: number; lastX: number; lastY: number; startX: number; startY: number } | null>(null);
  // Start eines Fingers auf leerer Fläche (Seite scrollen oder gezoomt verschieben): kurzes Tippen hebt die Auswahl auf.
  const touchTapRef = useRef<{ id: number; startX: number; startY: number } | null>(null);

  // Abstand und Mittelpunkt der ersten beiden Finger neu merken (bei Start und wenn sich das Fingerpaar ändert).
  function resetPinchReference() {
    const pinch = pinchRef.current;
    const pair = firstTwoTouches(touchPointsRef.current);
    if (!pinch || !pair) return;
    const [a, b] = pair;
    pinch.dist = Math.hypot(b.x - a.x, b.y - a.y);
    pinch.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  // Zwei Finger: zoomen zum Mittelpunkt und mit ihm verschieben; ohne Zoom und ohne Spreizen scrollt die Seite.
  function handlePinchMove() {
    const pinch = pinchRef.current;
    const pair = firstTwoTouches(touchPointsRef.current);
    if (!pinch || !pair) return;
    const [a, b] = pair;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const factor = pinchFactor(pinch.dist, dist);
    const dxMid = mid.x - pinch.mid.x;
    const dyMid = mid.y - pinch.mid.y;
    pinch.dist = dist;
    pinch.mid = mid;
    pinch.cumFactor *= factor;
    if (factor === 1 && dxMid === 0 && dyMid === 0) return;
    if (!pinch.zoomed && Math.abs(pinch.cumFactor - 1) < PINCH_SCROLL_TOLERANCE) {
      window.scrollBy(-dxMid, -dyMid);
      return;
    }
    pinch.zoomed = true;
    const k = metersPerPxOf(svgRef.current);
    const focus = svgPointFromClient(mid.x, mid.y);
    setView((v) => panBy(zoomAt(v ?? baseView, baseView, factor, focus), -dxMid * k, -dyMid * k));
  }

  function handleTouchDown(e: React.PointerEvent<SVGSVGElement>) {
    touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Notizen zählen wie Stücke: Antippen wählt sie aus, statt die Seite zu scrollen.
    const onPiece = (e.target as Element).closest('[data-pce-piece], [data-pce-anno]') !== null;
    const intent = touchGestureIntent({
      touchCount: touchPointsRef.current.size,
      onPiece,
      // Im Verschieben-Modus und mit Beschriften-Werkzeug wirkt Antippen wie beim bewaffneten Werkzeug: kein Scrollen, Tap ist das Ziel.
      armed: !!armed || moveMode || annoTool !== null,
      zoomed: view !== null,
    });
    if (intent === 'pinch') {
      // Der zweite Finger darf nicht den Stück-Handler erreichen, und ein laufendes Ziehen bricht ab.
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // best-effort, siehe usePointerDrag
      }
      if (!pinchRef.current) {
        pieceDrag.cancel();
        panDrag.cancel();
        touchScrollRef.current = null;
        touchTapRef.current = null;
        pinchRef.current = { dist: 0, mid: { x: 0, y: 0 }, cumFactor: 1, zoomed: view !== null };
        setFrozenBase(baseView);
      }
      resetPinchReference();
      return;
    }
    if (intent === 'page-scroll' || intent === 'pan-view') {
      touchTapRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY };
    }
    if (intent === 'page-scroll') {
      touchScrollRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // best-effort, siehe usePointerDrag
      }
    } else if (intent === 'pan-view') {
      panHandlers.onPointerDown(e);
    }
    // 'piece' und 'none' bleiben beim bisherigen Verhalten (Stück-Handler bzw. Tippen beim Platzieren).
  }

  function handleTouchMove(e: React.PointerEvent<SVGSVGElement>) {
    const point = touchPointsRef.current.get(e.pointerId);
    if (point) {
      point.x = e.clientX;
      point.y = e.clientY;
    }
    if (pinchRef.current) {
      handlePinchMove();
      return;
    }
    const scroll = touchScrollRef.current;
    if (scroll && scroll.id === e.pointerId) {
      window.scrollBy(-(e.clientX - scroll.lastX), -(e.clientY - scroll.lastY));
      scroll.lastX = e.clientX;
      scroll.lastY = e.clientY;
    }
  }

  function handleTouchEnd(e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) {
    const points = touchPointsRef.current;
    points.delete(e.pointerId);
    const scroll = touchScrollRef.current;
    if (scroll && scroll.id === e.pointerId) touchScrollRef.current = null;
    const tapStart = touchTapRef.current;
    if (tapStart && tapStart.id === e.pointerId) {
      touchTapRef.current = null;
      // Tippen ohne Bewegung auf leerer Fläche hebt die Auswahl auf (auch gezoomt, wo der Finger sonst verschiebt).
      const tap = Math.hypot(e.clientX - tapStart.startX, e.clientY - tapStart.startY) < TAP_SLOP_PX;
      if (!cancelled && tap) {
        setSelectedIds([]);
        setSelectedAnnoId(null);
      }
    }
    if (pinchRef.current) {
      if (points.size < 2) {
        pinchRef.current = null;
        setFrozenBase(null);
      } else {
        resetPinchReference();
      }
    }
  }

  // Zoomschalter: um die Mitte der aktuellen Ansicht zoomen.
  function zoomByButton(factor: number) {
    setView((v) => {
      const cur = v ?? effectiveBase;
      return zoomAt(cur, effectiveBase, factor, { x: cur.x + cur.w / 2, y: cur.y + cur.h / 2 });
    });
  }

  const selectedPiece = selectedId ? pieces.find((p) => p.id === selectedId) ?? null : null;
  // Roving-Focus: nur das Stück mit tabIndex 0 ist per Tab erreichbar (erste Auswahl, sonst das erste Stück).
  const focusId = selectedIds[0] ?? pieces[0]?.id;
  const focusRingPiece = focusedPieceId ? pieces.find((q) => q.id === focusedPieceId) ?? null : null;

  function rotateSelected() {
    // Mehrfachauswahl: als Block um die Mitte drehen (nur mit onReplaceAll).
    if (selectedIds.length > 1 && onReplaceAll) {
      const next = rotateGroupAroundCenter(pieces, selectedIds, GRID_STEP_M, blockers);
      if (next === null) showBlockedMessage('Drehen nicht möglich – die gedrehte Auswahl würde andere Stücke überlappen.');
      else onReplaceAll(next);
      return;
    }
    if (!selectedPiece) return;
    // Mit onReplaceAll um den Mittelpunkt drehen, passend zu Ziehen (Kanten-Fang, Nachrücken).
    if (onReplaceAll) {
      const next = rotatePieceAroundCenter(pieces, selectedPiece.id, placementOptions(), blockers);
      // Die gedrehte Lage darf nicht außerhalb des Raums liegen (voller Raum): dann nichts ändern.
      const turned = next.find((q) => q.id === selectedPiece.id);
      if (turned && !rectInsideRoom(turned, room)) {
        showBlockedMessage(ROOM_FULL_TEXT);
        return;
      }
      onReplaceAll(next);
      return;
    }
    // Ein quadratisches Dreieck (1×1) oder Viertelkreis behält beim Drehen exakt seine Bounding-Box
    // (nur die Ecke wechselt) — kann also nie neu kollidieren.
    // Ein nicht-quadratisches Dreieck (2×1) ändert seine Box beim Drehen und muss wie ein Rechteck
    // behandelt werden (Kollisions-Check, ggf. nachdrücken).
    const isSquare = Math.abs(selectedPiece.w - selectedPiece.d) < 1e-6;
    if (selectedPiece.corner !== undefined && isSquare) {
      onRotatePiece(selectedPiece.id);
      return;
    }
    const rotatedW = selectedPiece.d;
    const rotatedD = selectedPiece.w;
    if (fitsAt(occupied, selectedPiece.x, selectedPiece.y, rotatedW, rotatedD, selectedPiece.id)) {
      onRotatePiece(selectedPiece.id);
      return;
    }
    // Passt an der aktuellen Stelle gedreht nicht (die Bounding-Box wächst/schrumpft je nach
    // Achse) — statt hart zu blockieren, wie beim Ziehen die nächstgelegene freie Stelle für die
    // gedrehten Maße suchen und dorthin rücken. findFreePosition liefert für ein Einzelstück
    // immer ein Ergebnis (siehe customShape.ts), ein echter Fehlerfall entfällt damit.
    const target = snappedPlacement(rotatedW, rotatedD, selectedPiece.x, selectedPiece.y, selectedPiece.id);
    if (!target.valid) {
      showBlockedMessage(ROOM_FULL_TEXT);
      return;
    }
    batch(() => {
      onMovePiece(selectedPiece.id, target.x, target.y);
      onRotatePiece(selectedPiece.id);
    });
  }

  function rotateCurrent() {
    if (armed) {
      setArmedState((cur) => (cur ? rotatePayload(cur) : cur));
      return;
    }
    rotateSelected();
  }

  function mirrorCurrent() {
    if (armed?.kind === 'triangle') {
      setArmedState((cur) => (cur?.kind === 'triangle' ? mirrorPayload(cur) : cur));
      return;
    }
    if (selectedPiece && onMirrorPiece) onMirrorPiece(selectedPiece.id);
  }

  function removeSelected() {
    if (selectedIds.length === 0) return;
    announce(`${stueckeText(selectedIds.length)} entfernt.`);
    if (onRemovePieces) onRemovePieces(selectedIds);
    else batch(() => selectedIds.forEach((id) => onRemovePiece(id)));
    setSelectedIds([]);
  }

  // Sperren: die Auswahl bleibt belegt, wird aber abgewählt und ist danach nicht mehr auswählbar oder verschiebbar.
  function lockSelected() {
    if (selectedIds.length === 0) return;
    setLockedIds((cur) => new Set([...cur, ...selectedIds]));
    setSelectedIds([]);
  }

  function unlockAll() {
    setLockedIds(new Set());
  }

  // Kopiert die Auswahl als Block nach rechts (erste freie Stelle). Ein Einfüge-Aufruf = ein Undo-Schritt.
  // Die Auswahl springt auf die Kopie, so baut wiederholtes Strg+D die Reihe nach rechts weiter.
  function duplicateSelected() {
    if (selectedIds.length === 0) return;
    const copy = duplicateWithOffset(pieces, selectedIds, 20, blockers);
    if (!copy) {
      showBlockedMessage('Kein freier Platz zum Duplizieren gefunden.');
      return;
    }
    announce(`${stueckeText(copy.length)} dupliziert.`);
    if (onInsertPieces) {
      const withIds = copy.map((p) => ({ ...p, id: makePieceId() }));
      onInsertPieces(withIds);
      setSelectedIds(withoutLocked(withIds.map((p) => p.id), lockedIds));
      return;
    }
    onAddPieces(copy);
  }

  const canShiftLeft = pieces.length > 0 && shiftPieces(pieces, -GRID_STEP_M) !== null;

  function shiftAll(dx: number) {
    if (pieces.length === 0) return;
    if (dx < 0 && !canShiftLeft) {
      showBlockedMessage('Weiter nach links geht nicht — die Fläche liegt schon am linken Rand.');
      return;
    }
    // Mit Raum: alle Stücke gemeinsam gegen Hindernisse und Außenbereich prüfen.
    if (room && checkGroupMove(pieces, pieces.map((p) => p.id), dx, 0, blockers) !== 'ok') {
      showBlockedMessage('Dort ist kein Platz – ein Hindernis oder die Raumgrenze liegt im Weg. Nichts verschoben.');
      return;
    }
    onShiftAll(dx);
  }

  // Pfeil-Nudge für die ganze Auswahl (ein oder mehrere Stücke): ein Undo-Schritt pro Tastendruck,
  // bei Blockade (Rand oder Kollision) Meldung statt stiller Abbruch — und kein Undo-Eintrag.
  function nudgeSelection(ux: number, uy: number, step: number) {
    const dx = round1(ux * step);
    const dy = round1(uy * step);
    const result = checkGroupMove(pieces, selectedIds, dx, dy, blockers);
    if (result !== 'ok') {
      showBlockedMessage(groupBlockedText(result));
      return;
    }
    moveSelectionBy(dx, dy);
  }

  // Blockade-Meldung für eine nicht mögliche Gruppenbewegung (Pfeil-Buttons, Ziel antippen).
  function groupBlockedText(result: GroupMoveCheck): string {
    return result === 'out-of-bounds' ? 'Weiter geht es nicht – der Plan beginnt hier.' : 'Dort ist kein Platz – ein anderes Stück liegt im Weg.';
  }

  // Verschiebt die ganze Auswahl um (dx, dy) als ein Undo-Schritt.
  function moveSelectionBy(dx: number, dy: number) {
    if (onMovePieces) {
      onMovePieces(selectedIds, dx, dy);
      return;
    }
    batch(() => pieces.filter((p) => selectedIds.includes(p.id)).forEach((p) => onMovePiece(p.id, round1(p.x + dx), round1(p.y + dy))));
  }

  // Verschieben ohne Ziehen: "Verschieben" antippen, dann Ziel auf dem Plan antippen (Esc bricht ab).
  function startMoveMode() {
    if (selectedIds.length === 0) return;
    setMoveMode(true);
    svgRef.current?.focus({ preventScroll: true });
  }

  // Zielpunkt im Verschieben-Modus: ein Stück bekommt eine freie Stelle nahe dem Ziel, eine Auswahl
  // wird mit ihrer linken oberen Ecke aufs Raster dorthin gesetzt. Blockaden werden gemeldet.
  function handleMoveTarget(clientX: number, clientY: number) {
    setMoveMode(false);
    if (selectedIds.length === 0) return;
    const p = svgPointFromClient(clientX, clientY);
    if (selectedIds.length === 1) {
      const piece = pieces.find((q) => q.id === selectedIds[0]);
      if (!piece) return;
      const pos = snappedPlacement(piece.w, piece.d, p.x, p.y, piece.id, placementOptions());
      if (!pos.valid) {
        showBlockedMessage(ROOM_FULL_TEXT);
        return;
      }
      if (pos.x !== piece.x || pos.y !== piece.y) onMovePiece(piece.id, pos.x, pos.y);
      return;
    }
    const { dx, dy, result } = moveGroupTo(pieces, selectedIds, p.x, p.y, GRID_STEP_M, blockers);
    if (result !== 'ok') {
      showBlockedMessage(groupBlockedText(result));
      return;
    }
    if (dx !== 0 || dy !== 0) moveSelectionBy(dx, dy);
  }

  // Tastatur-Sprung zu einem Stück: Fokus setzen, auswählen (gesperrte bleiben unausgewählt) und den Namen ansagen.
  function jumpToPiece(id: string) {
    const piece = pieces.find((q) => q.id === id);
    if (!piece) return;
    const locked = lockedIds.has(id);
    // Gesperrte Ebene oder Nur-Lesen: nur Fokus, keine Auswahl — die Ansage sagt dann auch nicht "ausgewählt".
    const selectable = !locked && editable;
    if (selectable) setSelectedIds([id]);
    pieceElsRef.current.get(id)?.focus();
    announce(pieceAriaLabel(piece, selectable, locked));
  }

  // Tastaturfokus auf einem Stück: Fokusring zeigen und das Stück allein auswählen. Nur bei sichtbarem Fokus,
  // sonst würde der Fokus nach dem Mausklick Umschalt-Mehrfachauswahl und Gruppenziehen zerstören.
  function handlePieceFocus(e: React.FocusEvent<SVGElement>, p: Piece2D) {
    if (!(e.currentTarget as Element).matches(':focus-visible')) return;
    setFocusedPieceId(p.id);
    if (editable && !lockedIds.has(p.id) && !selectedIds.includes(p.id)) setSelectedIds([p.id]);
  }

  // Tastatur-Bedienung des Plans, nur aktiv wenn das SVG fokussiert ist (Klick oder Tab hinein) —
  // dadurch keine Kollision mit Eingabefeldern anderswo auf der Seite (z.B. Konfigurationsname).
  // Pfeiltasten bewegen die Auswahl (Umschalt = 1 m, blockiert mit Meldung) oder — bei bewaffnetem
  // Werkzeug — einen Tastatur-Cursor (dieselbe pointerPos,
  // die auch die Maus-Vorschau treibt), Enter/Leertaste platziert dort. R dreht, Entf/Rücktaste
  // entfernt, Esc bricht ab. 1–4 wählen die Plattengrößen in derselben Reihenfolge wie die Rechteck-Kacheln der Palette (2 / 1,5 / 1 / 0,5 m),
  // T bewaffnet das Dreieckpodest.
  // Undo/Redo behandelt handleEditorKeyDown am Container, damit es auch nach Klick auf Palette/Toolbar wirkt.
  function handleCanvasKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      pieceDrag.cancel();
      setPaletteDrag(null);
      // Im Verschieben-Modus bricht Esc nur das Verschieben ab; die Auswahl bleibt.
      if (moveMode) {
        setMoveMode(false);
        return;
      }
      if (armed) announce('Werkzeug abgebrochen.');
      arm(null);
      return;
    }
    // Strg+Pfeil (ohne Umschalt): zum nächsten Stück in dieser Richtung springen.
    if (focusId && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      const unit = ARROW_DELTA[e.key];
      if (unit) {
        e.preventDefault();
        const dir = unit[0] < 0 ? 'left' : unit[0] > 0 ? 'right' : unit[1] < 0 ? 'up' : 'down';
        const next = nearestPieceInDirection(pieces, focusId, dir);
        if (next) jumpToPiece(next);
        return;
      }
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // 0 passt den Plan wieder ins Bild – nicht während eines Ziehens, dort bleibt die Ansicht stehen.
    if (e.key === '0') {
      e.preventDefault();
      if (frozenBaseRef.current === null) setView(null);
      return;
    }
    // N / Umschalt+N: nächstes bzw. vorheriges Stück in Lesereihenfolge (erst y, dann x). Auf dem Mac ist Strg+Pfeil ein Systemkürzel.
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && pieces.length > 0) {
      e.preventDefault();
      const ordered = [...pieces].sort((a, b) => a.y - b.y || a.x - b.x);
      const idx = ordered.findIndex((q) => q.id === focusId);
      const step = e.shiftKey ? -1 : 1;
      const target = idx < 0 ? ordered[step > 0 ? 0 : ordered.length - 1] : ordered[(idx + step + ordered.length) % ordered.length];
      jumpToPiece(target.id);
      return;
    }
    // Gesperrte Ebene oder Nur-Lesen: alle ändernden Tasten ignorieren (Zoom, 0, Esc, Fokus-Sprünge bleiben oben).
    if (!editable) return;
    // Entf/Rücktaste: zuerst eine gewählte Notiz, sonst die gewählten Stücke.
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnno && onAnnotationsChange) {
      e.preventDefault();
      if (!e.repeat) removeSelectedAnno();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
      e.preventDefault();
      if (!e.repeat) removeSelected();
      return;
    }
    if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      rotateCurrent();
      return;
    }
    // Umschalt+←/→ ohne Auswahl und ohne Werkzeug verschiebt die ganze Fläche.
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selectedIds.length === 0 && !armed) {
      e.preventDefault();
      shiftAll(e.key === 'ArrowLeft' ? -GRID_STEP_M : GRID_STEP_M);
      return;
    }
    const unit = ARROW_DELTA[e.key];
    if (unit) {
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_LARGE_M : GRID_STEP_M;
      if (selectedIds.length > 0) {
        nudgeSelection(unit[0], unit[1], step);
      } else if (armed) {
        setPointerPos((cur) => {
          const base = cur ?? { x: 0, y: 0 };
          return { x: Math.max(0, round1(base.x + unit[0] * step)), y: Math.max(0, round1(base.y + unit[1] * step)) };
        });
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && armed && pointerPos) {
      e.preventDefault();
      // Alt+Enter legt wie die Vorschau frei ab.
      commitPayloadAtPoint(armed, pointerPos, e.altKey);
      arm(null);
      return;
    }
    if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      const w = QUICK_WIDTHS[Number(e.key) - 1];
      const payload: ToolPayload = { kind: 'piece', w, d: 1 };
      arm(payloadMatches(armed, payload) ? null : payload);
      return;
    }
    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      const payload: ToolPayload = { kind: 'triangle', corner: 'tl', w: TRIANGLE_PANEL_SIZE_M, d: TRIANGLE_PANEL_SIZE_M };
      arm(armed?.kind === 'triangle' && armed.w === TRIANGLE_PANEL_SIZE_M && armed.d === TRIANGLE_PANEL_SIZE_M ? null : payload);
    }
  }

  // Strg/Cmd-Kurzbefehle am Container: greifen auch, wenn der Fokus auf Palette-Kachel oder Toolbar-Button liegt.
  // Eingabefelder behalten ihre nativen Tasten; IME-Eingaben werden ignoriert.
  // Einfügen läuft über das paste-Ereignis (handleEditorPaste); hier nur der Rückfall, falls kein Ereignis kommt.
  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isEditableTarget(e.target)) return;
    const action = editorShortcut({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing });
    if (!action) return;
    // Gesperrte Ebene: nur Kopieren bleibt (ändert nichts); Undo, Redo, Alles auswählen, Duplizieren, Ausschneiden und Einfügen entfallen.
    if (!editable && action !== 'copy') return;
    if (action === 'undo' || action === 'redo') {
      e.preventDefault();
      if (action === 'undo') onUndo?.();
      else onRedo?.();
      return;
    }
    if (action === 'selectAll') {
      e.preventDefault();
      arm(null);
      setSelectedIds(pieces.filter((p) => !lockedIds.has(p.id)).map((p) => p.id));
      return;
    }
    if (action === 'duplicate') {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (action === 'copy' || action === 'cut') {
      if (selectedIds.length === 0) return;
      e.preventDefault();
      const payload = makeClipboardPayload(pieces, selectedIds);
      if (!payload) return;
      setMemoryClipboard(payload);
      // writeText braucht keine Berechtigungsabfrage; scheitert es, bleibt die interne Zwischenablage.
      void navigator.clipboard?.writeText(serializeClipboard(payload)).catch(() => {});
      if (action === 'cut') removeSelected();
      return;
    }
    if (action === 'paste') {
      // Ohne paste-Ereignis (Fokus auf nicht editierbarem Element) fügt der Timer die interne Zwischenablage ein.
      pasteHandledRef.current = false;
      setTimeout(() => {
        if (pasteHandledRef.current) return;
        const m = getMemoryClipboard();
        if (m) pastePayload(m);
      }, 0);
    }
  }

  // Einfügen über das paste-Ereignis: der Text kommt direkt aus dem Ereignis, daher kein readText und keine Berechtigungsabfrage.
  // Fremder Text wird ignoriert, dann gilt die interne Zwischenablage.
  function handleEditorPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (isEditableTarget(e.target)) return;
    if (!editable) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const payload = parseClipboard(text) ?? getMemoryClipboard();
    if (!payload) return;
    e.preventDefault();
    pasteHandledRef.current = true;
    pastePayload(payload);
  }

  // Fügt die Zwischenablage an der Mausposition ein (sonst rechts neben dem Bestand). Die Kopie wird danach ausgewählt.
  function pastePayload(payload: PiecesClipboardPayload) {
    const placed = placeClipboard(piecesRef.current, payload, lastPointerRef.current, GRID_STEP_M, blockers);
    if (!placed) {
      showBlockedMessage('Kein freier Platz zum Einfügen gefunden.');
      return;
    }
    announce(`${stueckeText(placed.length)} eingefügt.`);
    if (onInsertPieces) {
      const withIds = placed.map((p) => ({ ...p, id: makePieceId() }));
      onInsertPieces(withIds);
      setSelectedIds(withoutLocked(withIds.map((p) => p.id), lockedIds));
      return;
    }
    onAddPieces(placed);
  }

  // Rechtsklick auf ein Stück: Leiste am Cursor. Ein nicht ausgewähltes Stück wird allein ausgewählt.
  // Während eines Paletten-Ziehens dreht der Rechtsklick das Teil (Fenster-Listener), daher hier nichts tun.
  function handlePieceContextMenu(e: React.MouseEvent<SVGElement>, pieceId: string) {
    if (paletteDrag || armed) return;
    e.preventDefault();
    const nextIds = selectedIds.includes(pieceId) ? selectedIds : [pieceId];
    setSelectedIds(nextIds);
    const wr = wrapRef.current?.getBoundingClientRect();
    if (!wr) return;
    const left = Math.min(Math.max(0, e.clientX - wr.left), Math.max(0, wr.width - SELECTION_BAR_WIDTH_PX));
    setBarAtPointer({ left, top: Math.max(0, e.clientY - wr.top + 8), ids: nextIds });
  }

  // Statuszeile der Toolbar: sagt, was gerade passiert bzw. was als Nächstes zu tun ist.
  function statusText(): string {
    if (readOnly) return 'Nur-Lesen-Ansicht';
    if (!editable) return 'Ebene gesperrt – zum Bearbeiten entsperren.';
    if (annoTool) {
      if (annoTool === 'measure') return measureStart ? 'Zweiten Messpunkt antippen. Esc bricht ab.' : 'Ersten Messpunkt antippen. Esc bricht ab.';
      if (annoTool === 'text') return 'Stelle für die Notiz antippen. Esc bricht ab.';
      return `Stelle für das Symbol ${SYMBOL_LABELS[annoTool.symbol]} antippen. Esc bricht ab.`;
    }
    if (selectedAnno) return 'Notiz ausgewählt – Entf löscht sie.';
    return moveMode
      ? 'Ziel antippen – die Auswahl wird mit ihrer linken oberen Ecke dorthin gesetzt. Esc bricht ab.'
      : armed
      ? 'Jetzt auf den Plan klicken, um das Stück zu platzieren.'
      : selectedPiece
        ? `Ausgewählt: ${formatMeters(selectedPiece.w, 2)}×${formatMeters(selectedPiece.d, 2)} m${
            selectedPiece.corner !== undefined && selectedPiece.w !== selectedPiece.d
              ? ` (${triangleHand(selectedPiece.corner, selectedPiece.w, selectedPiece.d)})`
              : ''
          }`
        : selectedIds.length > 1
          ? `${selectedIds.length} Stücke ausgewählt`
          : multiSelect
            ? 'Stücke antippen, um sie zur Auswahl hinzuzufügen oder wieder zu entfernen.'
            : 'Stück anklicken (Umschalt+Klick für mehrere) oder unten eins wählen.';
  }

  // Rahmen der Aufziehen-Geste, normalisiert (oben links); erst ab einer echten Bewegung sichtbar.
  const marqueeBox =
    marquee && (marquee.x1 !== marquee.x0 || marquee.y1 !== marquee.y0)
      ? {
          x: Math.min(marquee.x0, marquee.x1),
          y: Math.min(marquee.y0, marquee.y1),
          w: Math.abs(marquee.x1 - marquee.x0),
          d: Math.abs(marquee.y1 - marquee.y0),
        }
      : null;
  // Gesamtmaß der Mehrfachauswahl (Rahmen mit Maßangabe).
  const selectedRects = selectedIds.length > 1 ? pieces.filter((p) => selectedIds.includes(p.id)) : [];
  const selectionBounds = selectedRects.length > 1 ? unionBounds(selectedRects) : null;

  // Schwebende Aktionsleiste: nur bei Auswahl und ohne laufendes Ziehen, Werkzeug oder Rahmen.
  const barVisible = editable && selectedIds.length > 0 && !drag?.moved && !armed && !moveMode && !paletteDrag && !marquee && annoTool === null;
  const showMirrorSelected = selectedPiece?.corner !== undefined && selectedPiece.w !== selectedPiece.d;
  const canRotateSelection = !!selectedPiece || (selectedIds.length > 1 && !!onReplaceAll);
  const barActions: SelectionAction[] = [
    { key: 'rotate', label: '⤾ Drehen', ariaLabel: 'Auswahl drehen', onClick: rotateCurrent, disabled: !canRotateSelection },
    { key: 'duplicate', label: 'Duplizieren', ariaLabel: 'Auswahl duplizieren', onClick: duplicateSelected },
    ...(showMirrorSelected && onMirrorPiece ? [{ key: 'mirror', label: '⇋ Spiegeln', ariaLabel: 'Stück spiegeln', onClick: mirrorCurrent }] : []),
    { key: 'move', label: 'Verschieben', ariaLabel: 'Auswahl verschieben: danach Ziel auf dem Plan antippen', onClick: startMoveMode },
    { key: 'left', label: '←', ariaLabel: 'Auswahl 0,5 m nach links', onClick: () => nudgeSelection(-1, 0, GRID_STEP_M) },
    { key: 'up', label: '↑', ariaLabel: 'Auswahl 0,5 m nach oben', onClick: () => nudgeSelection(0, -1, GRID_STEP_M) },
    { key: 'down', label: '↓', ariaLabel: 'Auswahl 0,5 m nach unten', onClick: () => nudgeSelection(0, 1, GRID_STEP_M) },
    { key: 'right', label: '→', ariaLabel: 'Auswahl 0,5 m nach rechts', onClick: () => nudgeSelection(1, 0, GRID_STEP_M) },
    { key: 'remove', label: 'Entfernen', ariaLabel: 'Auswahl entfernen', danger: true, onClick: removeSelected },
  ];
  // Bei Touch-Ziehen erscheint ein Drehen-Button, den ein zweiter Finger antippt (Stück bzw. Palette-Kachel).
  const touchRotating = (paletteDrag?.moved && paletteDrag.pointerType === 'touch') || (drag?.moved && drag.pointerType === 'touch' && !drag.group);
  // Position über der Auswahl: an Plan-Koordinaten gekoppelt, damit sie Zoom und Ausschnitt folgt.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    const ctm = svg?.getScreenCTM();
    const b = unionBounds(pieces.filter((p) => selectedIds.includes(p.id)));
    if (!barVisible || !svg || !wrap || !ctm || !b) return;
    const wr = wrap.getBoundingClientRect();
    const left = Math.min(Math.max(0, ctm.e + b.x * ctm.a - wr.left), Math.max(0, wr.width - SELECTION_BAR_WIDTH_PX));
    let top = ctm.f + b.y * ctm.d - wr.top - SELECTION_BAR_HEIGHT_PX;
    // Oberhalb des Plans kein Platz: unterhalb der Auswahl zeigen.
    if (top < 0) top = ctm.f + (b.y + b.d) * ctm.d - wr.top + 8;
    setBarPos((cur) => (cur && cur.left === left && cur.top === top ? cur : { left, top }));
  }, [barVisible, selectedIds, pieces, view, drag, viewBox]);
  const barShown = barAtPointer && barAtPointer.ids === selectedIds ? barAtPointer : barPos;

  // Nach jedem Commit die aktuellen Handler für die Palette aktualisieren (siehe paletteCallbacks);
  // vor jedem Ereignis ist der Ref damit aktuell, ohne während des Renders auf den Ref zuzugreifen.
  useLayoutEffect(() => {
    paletteHandlersRef.current = { down: handlePaletteButtonPointerDown, move: handlePaletteButtonPointerMove, up: handlePaletteButtonPointerUp, arm };
  });
  // Stückliste für den Rückfall-Timer beim Einfügen aktuell halten (siehe piecesRef).
  useLayoutEffect(() => {
    piecesRef.current = pieces;
    baseRef.current = effectiveBase;
    paletteDragRef.current = paletteDrag;
  });
  return (
    <div ref={containerRef} className="space-y-3" onKeyDown={handleEditorKeyDown} onPaste={handleEditorPaste}>
      {/* Gesperrt oder Nur-Lesen: "Alles verschieben" und "Plan leeren" entfallen (piecesCount 0 blendet sie aus). */}
      <EditorToolbar
        statusText={statusText()}
        onUndo={readOnly ? undefined : onUndo}
        onRedo={readOnly ? undefined : onRedo}
        canUndo={editable && canUndo}
        canRedo={editable && canRedo}
        canRotate={editable && (!!armed || !!selectedPiece || (selectedIds.length > 1 && !!onReplaceAll))}
        onRotate={rotateCurrent}
        canDuplicate={editable && selectedIds.length > 0}
        onDuplicate={duplicateSelected}
        showMirror={editable && ((armed?.kind === 'triangle' && armed.w !== armed.d) || (selectedPiece?.corner !== undefined && selectedPiece.w !== selectedPiece.d))}
        onMirror={mirrorCurrent}
        removeCount={selectedIds.length}
        onRemove={removeSelected}
        cancelLabel={armed ? 'Abbrechen' : selectedIds.length > 0 ? 'Abwählen' : null}
        onCancel={() => (armed ? arm(null) : setSelectedIds([]))}
        piecesCount={editable ? pieces.length : 0}
        canShiftLeft={canShiftLeft}
        onShiftAll={shiftAll}
        shiftStepM={GRID_STEP_M}
        onClear={onClear && editable ? handleClear : undefined}
        multiSelect={multiSelect}
        onToggleMultiSelect={editable ? () => setMultiSelect((v) => !v) : undefined}
        extra={
          <>
            <button
              type="button"
              onClick={toggleShowDims}
              aria-pressed={showDims}
              title="Maßketten ein/aus"
              className={`${ACTION_BTN} ${showDims ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : ''}`}
            >
              Maße
            </button>
            {editable && onAnnotationsChange && (
              <>
                <select
                  aria-label="Beschriften"
                  value={annoSelectValue}
                  onChange={(e) => chooseAnnoTool(e.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
                >
                  <option value="">— Beschriften —</option>
                  <option value="measure">Messen</option>
                  <option value="text">Text</option>
                  {SYMBOL_KINDS.map((k) => (
                    <option key={k} value={`symbol:${k}`}>
                      Symbol: {SYMBOL_LABELS[k]}
                    </option>
                  ))}
                </select>
                {selectedAnno && (
                  <button type="button" onClick={removeSelectedAnno} className={ACTION_BTN}>
                    Notiz entfernen
                  </button>
                )}
              </>
            )}
            {moveMode && (
              <button type="button" onClick={() => setMoveMode(false)} className={ACTION_BTN}>
                Verschieben abbrechen
              </button>
            )}
            {editable && (
              <button type="button" onClick={saveSelectionAsBlock} disabled={selectedIds.length === 0} className={ACTION_BTN}>
                Als Baustein speichern
              </button>
            )}
            {editable && selectedIds.length > 0 && (
              <button
                type="button"
                onClick={lockSelected}
                title="Auswahl sperren: bleibt im Plan belegt, lässt sich aber nicht mehr auswählen oder verschieben"
                className={ACTION_BTN}
              >
                Sperren
              </button>
            )}
            {lockedIds.size > 0 && (
              <button type="button" onClick={unlockAll} className={ACTION_BTN}>
                Alle entsperren ({lockedIds.size})
              </button>
            )}
            <ZoomControls
              zoomPercent={zoomPercent}
              onZoomIn={() => zoomByButton(1.25)}
              onZoomOut={() => zoomByButton(1 / 1.25)}
              onFit={() => setView(null)}
            />
          </>
        }
      />
      {/* Live-Region bleibt immer im DOM, sonst kündigen Screenreader die erst eingefügte Meldung oft nicht an. */}
      <div aria-live="assertive" aria-atomic="true">
        {blockedMessage && (
          <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {blockedMessage}
          </div>
        )}
      </div>
      {clearedSnack && pieces.length === 0 && !readOnly && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          Plan geleert
          {onUndo && (
            <button
              type="button"
              className="underline text-[var(--color-accent)]"
              onClick={() => {
                onUndo();
                setClearedSnack(false);
              }}
            >
              Rückgängig
            </button>
          )}
        </div>
      )}

      <div aria-live="polite" className="sr-only">{announcement}</div>
      <div ref={wrapRef} className="relative">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="block w-full h-auto max-h-[420px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] select-none"
        style={{ touchAction: 'none', cursor: panDrag.active || drag?.moved ? 'grabbing' : spaceHeld ? 'grab' : undefined }}
        role="application"
        aria-roledescription="Plan-Editor"
        aria-label="Bau-Editor — klicken und dann Tastatur nutzen (Pfeiltasten, Enter, R, Entf, Esc, 1–4, T; Strg+Pfeil oder N/Umschalt+N springt zum nächsten Stück; Kurzbefehle siehe unten)"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
        onPointerDownCapture={(e) => {
          // Touch: eigene Entscheidung je Finger (Stück, Seite scrollen, Plan verschieben, zwei Finger).
          if (e.pointerType === 'touch') {
            handleTouchDown(e);
            return;
          }
          // Mittlere Taste oder Leertaste+links verschiebt den Plan. Die Capture-Phase fängt das vor den Stücken ab.
          const panStart = e.button === 1 || (spaceHeld && e.button === 0);
          if (!panStart) return;
          // Mittelklick würde unter Windows das Auto-Scrollen starten.
          if (e.button === 1) e.preventDefault();
          e.stopPropagation();
          panHandlers.onPointerDown(e);
        }}
        onPointerMoveCapture={(e) => {
          if (e.pointerType === 'touch') handleTouchMove(e);
        }}
        onPointerUpCapture={(e) => {
          if (e.pointerType === 'touch') handleTouchEnd(e, false);
        }}
        onPointerCancelCapture={(e) => {
          if (e.pointerType === 'touch') handleTouchEnd(e, true);
        }}
        onPointerMove={(e) => {
          lastPointerRef.current = svgPointFromClient(e.clientX, e.clientY);
          panHandlers.onPointerMove(e);
        }}
        onPointerUp={panHandlers.onPointerUp}
        onPointerCancel={panHandlers.onPointerCancel}
        onLostPointerCapture={panHandlers.onLostPointerCapture}
        onPointerLeave={() => {
          lastPointerRef.current = null;
        }}
      >
        <CanvasGrid
          uid={uid}
          canvasWidthM={canvasWidthM}
          canvasDepthM={canvasDepthM}
          frontEdgeLabel={frontEdgeLabel}
          gridStepM={GRID_STEP_M}
          pad={PAD}
        />
        {room && <RoomLayer room={room} px={metersPerPx} />}

        <rect
          x={0}
          y={0}
          width={canvasWidthM}
          height={canvasDepthM}
          fill="transparent"
          pointerEvents={armed ? 'all' : 'none'}
          onPointerMove={(e) => {
            if (!armed) return;
            setAltHeld(e.altKey);
            setPointerPos(svgPointFromClient(e.clientX, e.clientY));
          }}
          onClick={(e) => {
            if (!armed) return;
            commitPayloadAt(armed, e.clientX, e.clientY, e.altKey);
            arm(null);
          }}
          style={{ cursor: armed ? 'copy' : 'default' }}
        />
        {/* Leere Fläche: Rahmen aufziehen (Maus/Stift) bzw. Klick hebt die Auswahl auf. Liegt unter den Stücken. */}
        {editable && !armed && !paletteDrag && !spaceHeld && annoTool === null && (
          <rect
            x={0}
            y={0}
            width={canvasWidthM}
            height={canvasDepthM}
            fill="transparent"
            {...marqueeDrag.bind(null)}
          />
        )}
        {marqueeBox && (
          <rect
            x={marqueeBox.x}
            y={marqueeBox.y}
            width={marqueeBox.w}
            height={marqueeBox.d}
            fill="var(--color-accent)"
            fillOpacity={0.08}
            stroke="var(--color-accent)"
            strokeWidth={metersPerPx}
            strokeDasharray={`${4 * metersPerPx} ${3 * metersPerPx}`}
            pointerEvents="none"
          />
        )}

        {referenceFootprint && (
          <>
            <rect
              x={referenceFootprint.x}
              y={referenceFootprint.y}
              width={referenceFootprint.widthM}
              height={referenceFootprint.depthM}
              fill="none"
              stroke="var(--color-accent)"
              strokeDasharray="0.1 0.1"
              strokeWidth={0.02}
              opacity={0.5}
              pointerEvents="none"
            />
            {referenceFootprint.label && (
              <text
                x={referenceFootprint.x + referenceFootprint.widthM / 2}
                y={
                  referenceFootprint.y +
                  Math.min(referenceFootprint.depthM, Math.max(0, canvasDepthM - referenceFootprint.y)) / 2
                }
                fontSize={0.2}
                textAnchor="middle"
                fill="var(--color-accent)"
                opacity={0.5}
                style={{ pointerEvents: 'none' }}
              >
                {referenceFootprint.label}
              </text>
            )}
          </>
        )}

        {pieces.map((p) => {
          const isDragTarget = drag?.moved && (drag.group ? selectedIds.includes(p.id) : drag.id === p.id);
          // Bei p.corner !== undefined (Dreieck) NIE isSondermassPiece(p.w,p.d) aufrufen — (1,1)
          // ist auch die Bounding-Box des echten 1×1-Rechtecks, das würde fälschlich matchen.
          const sondermass = p.corner === undefined && isSondermassPiece(p.w, p.d);
          const isLocked = lockedIds.has(p.id);
          // Gesperrt (einzelnes Stück oder ganze Ebene): sichtbar und belegt, aber ohne Zeigerereignisse.
          const interactive = editable && !isLocked && !armed && !paletteDrag && !spaceHeld;
          // Hervorheben nur für nicht ausgewählte Stücke unter der Maus (Touch hat keinen Hover).
          const hovered = interactive && hoveredId === p.id && !selectedIds.includes(p.id);
          return (
            <PieceShape
              key={p.id}
              piece={{ ...p, shape: p.shape }}
              fill={sondermass ? `url(#pce-hatch-warning-${uid})` : `url(#pce-hatch-${uid})`}
              fillOpacity={isDragTarget ? 0.25 : isLocked ? 0.55 : 1}
              stroke={selectedIds.includes(p.id) || hovered ? 'var(--color-accent)' : 'var(--color-panel-stroke)'}
              strokeWidth={selectedIds.includes(p.id) ? 0.035 : hovered ? 0.025 : 0.02}
              strokeOpacity={hovered ? 0.6 : undefined}
              strokeDasharray={isLocked ? `${2 * metersPerPx} ${2 * metersPerPx}` : undefined}
              pointerEvents={interactive ? 'all' : 'none'}
              style={{ cursor: !interactive ? 'default' : drag?.moved ? 'inherit' : 'grab' }}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'touch') setHoveredId(p.id);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== 'touch') setHoveredId((cur) => (cur === p.id ? null : cur));
              }}
              onContextMenu={(e) => handlePieceContextMenu(e, p.id)}
              dataPiece
              tabIndex={p.id === focusId ? 0 : -1}
              role="button"
              ariaLabel={pieceAriaLabel(p, selectedIds.includes(p.id), isLocked)}
              elRef={(el) => {
                if (el) pieceElsRef.current.set(p.id, el);
                else pieceElsRef.current.delete(p.id);
              }}
              onFocus={(e) => handlePieceFocus(e, p)}
              onBlur={() => setFocusedPieceId((cur) => (cur === p.id ? null : cur))}
              {...pieceDrag.bind(p)}
            >
              <title>
                {formatMeters(p.w, 2)}×{formatMeters(p.d, 2)} m bei x={formatMeters(p.x, 2)}, y={formatMeters(p.y, 2)} m
                {isLocked ? ' (gesperrt)' : ''}
              </title>
            </PieceShape>
          );
        })}

        {/* Fokusring für das Stück mit Tastaturfokus: SVG zeigt sonst kein outline. */}
        {focusRingPiece && (
          <PieceShape piece={focusRingPiece} fill="none" stroke="var(--color-accent)" strokeWidth={0.05} pointerEvents="none" />
        )}
        {selectionBounds && selectedRects.length > 1 && !drag?.moved && (
          <g pointerEvents="none">
            <rect
              x={selectionBounds.x - SELECTION_FRAME_GAP_M}
              y={selectionBounds.y - SELECTION_FRAME_GAP_M}
              width={selectionBounds.w + 2 * SELECTION_FRAME_GAP_M}
              height={selectionBounds.d + 2 * SELECTION_FRAME_GAP_M}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={metersPerPx}
              strokeDasharray={`${4 * metersPerPx} ${3 * metersPerPx}`}
              opacity={0.7}
              pointerEvents="none"
            />
            <text
              x={selectionBounds.x + selectionBounds.w / 2}
              y={selectionBounds.y + selectionBounds.d + SELECTION_FRAME_GAP_M + 11 * metersPerPx}
              fontSize={11 * metersPerPx}
              textAnchor="middle"
              fill="var(--color-accent)"
              fontFamily="var(--font-mono)"
              style={{ pointerEvents: 'none' }}
            >
              {selectedRects.length} Stücke · {formatMeters(selectionBounds.w)} × {formatMeters(selectionBounds.d)} m
            </text>
          </g>
        )}

        {/* Maßketten: dauerhaft eingeblendet (Schalter "Maße"); während des Ziehens zeigen die Smart Guides die Maße. */}
        {showDims && pieces.length > 0 && !drag?.moved && (
          <DimensionChains rects={pieces} offsetM={18 * metersPerPx} fontSizeM={11 * metersPerPx} strokeWidthM={metersPerPx} />
        )}

        {/* Notizen, Symbole, Messlinien: Ebene über den Stücken. Anklickbar nur ohne Werkzeug und ohne Ziehen. */}
        <AnnotationLayer
          annotations={measurePreview ? [...annoList, measurePreview] : annoList}
          selectedId={selectedAnno?.id ?? null}
          px={metersPerPx}
          interactive={editable && !!onAnnotationsChange && !armed && annoTool === null && !paletteDrag && !spaceHeld}
          onSelect={selectAnno}
        />

        <DragOverlay
          pieces={shownPieces}
          selectedIds={selectedIds}
          drag={drag}
          previewPieces={previewPieces}
          guides={liveGeometry?.guides ?? []}
          gaps={liveGeometry?.gaps ?? []}
          total={liveGeometry?.total ?? null}
          px={metersPerPx}
        />

        {/* Beschriften: Klick legt Notiz, Symbol bzw. Messpunkt an. Liegt über allem, damit der Klick nicht an einem Stück hängenbleibt. */}
        {annoTool !== null && onAnnotationsChange && (
          <rect
            x={0}
            y={0}
            width={canvasWidthM}
            height={canvasDepthM}
            fill="transparent"
            pointerEvents="all"
            onPointerMove={(e) => setAnnoPointer(svgPointFromClient(e.clientX, e.clientY))}
            onPointerLeave={() => setAnnoPointer(null)}
            onClick={(e) => handleAnnoToolClick(e.clientX, e.clientY)}
            style={{ cursor: 'crosshair' }}
          />
        )}
        {/* Verschieben-Modus: Ziel antippen. Liegt über den Stücken, damit das Antippen das Ziel trifft und nicht das Stück. */}
        {moveMode && (
          <rect
            x={0}
            y={0}
            width={canvasWidthM}
            height={canvasDepthM}
            fill="transparent"
            pointerEvents="all"
            onClick={(e) => handleMoveTarget(e.clientX, e.clientY)}
            style={{ cursor: 'crosshair' }}
          />
        )}
      </svg>
      {barVisible && barShown && <SelectionActionBar left={barShown.left} top={barShown.top} actions={barActions} />}
      {touchRotating && (
        <button
          type="button"
          aria-label="Gezogenes Stück drehen"
          className="pce-target absolute right-2 top-2 z-10 flex h-12 w-12 touch-none select-none items-center justify-center rounded-full border border-[var(--color-accent)] bg-[var(--color-surface)] text-xl text-[var(--color-text)] shadow-md"
          onPointerDown={(e) => {
            // Ein zweiter Finger dreht sofort; der Plan darunter bekommt die Geste nicht.
            e.stopPropagation();
            e.preventDefault();
            if (paletteDrag) rotatePaletteDrag();
            else rotateDraggedPiece();
          }}
        >
          ⤾
        </button>
      )}
      {editable && pieces.length === 0 && !armed && !paletteDrag && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="pointer-events-auto max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-3 text-sm shadow-sm">
            <p className="font-medium">Leerer Plan – so geht&apos;s</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-[var(--color-text-muted)]">
              <li>Unten ein Teil antippen und auf den Plan tippen – oder direkt hineinziehen.</li>
              <li>R dreht, Entf entfernt, Pfeiltasten verschieben.</li>
              <li>Strg/Cmd+Z macht jeden Schritt rückgängig.</li>
            </ol>
            {emptyHint}
          </div>
        </div>
      )}
      </div>

      {/* Unter dem Plan statt darüber: das Auftauchen beim Auswählen (schon beim Pointerdown) darf den Plan nicht unter Finger/Maus verschieben. */}
      {editable && selectedPiece && onReplaceAll && (
        <PieceInspector
          key={selectedPiece.id}
          piece={selectedPiece}
          onApply={(edit) => {
            const r = validatePieceEdit(pieces, selectedPiece.id, edit, blockers);
            if (!r.ok) return r.reason;
            // Ohne Änderung keine neue Rückgängig-Stufe.
            if (r.pieces !== pieces) onReplaceAll(r.pieces);
            return null;
          }}
          onRotate={rotateSelected}
        />
      )}

      {editable && <PiecePalette armed={armed} blocks={paletteBlocks} hint="Teil auf den Plan ziehen oder anklicken und dann auf den Plan klicken. Beim Ziehen dreht R, Rechtsklick oder das Mausrad das Teil. Beim Ziehen zeigen Hilfslinien Fluchten, Abstände und das Gesamtmaß in m. Alt gedrückt halten: frei platzieren, ohne Einrasten. Auf dem Tablet: ein Finger auf freier Fläche scrollt die Seite, zwei Finger zoomen und verschieben den Plan." {...paletteCallbacks} />}

      <ShortcutHelp />
    </div>
  );
}
