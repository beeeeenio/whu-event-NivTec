import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  findFreePosition,
  fitsAt,
  makePieceId,
  placeUnsnapped,
  shiftPieces,
  type FilledPiece,
  type PlacementOptions,
  type Piece2D,
} from '../../domain/customShape';
import { checkGroupMove, duplicateWithOffset, rotateGroupAroundCenter, rotatePieceAroundCenter, snapGroupDelta } from '../../domain/pieceOps';
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
import { mirrorPayload, payloadMatches, payloadSize, payloadToFilled, rotatePayload, type ToolPayload } from '../../domain/toolPayload';
import { formatMeters } from '../../lib/format';
import { dragThresholdPx, isPrimaryButton, shouldRotateOnWheel } from '../../lib/pointer';
import { createFrameThrottle } from '../../lib/pointerDrag';
import { editorShortcut, isEditableTarget } from '../../lib/shortcuts';
import { CanvasGrid } from './editor/CanvasGrid';
import { DragOverlay } from './editor/DragOverlay';
import { EditorToolbar } from './editor/EditorToolbar';
import { PiecePalette } from './editor/PiecePalette';
import { PieceShape } from './editor/PieceShape';
import { ShortcutHelp } from './editor/ShortcutHelp';
import type { DragState, PaletteDragState } from './editor/types';
import { usePointerDrag } from '../../hooks/usePointerDrag';
import { pruneSelection } from '../../lib/pieceLayerProps';

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
}

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

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

const QUICK_WIDTHS = [2, 1.5, 1, 0.5] as const;


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
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
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
  // Undo/Redo oder Import können ausgewählte Stücke entfernen: IDs ohne Stück nicht festhalten.
  // Beim Wechsel der Stückliste direkt im Render nachziehen (kein Effekt, damit kein Zwischen-Render mit Geister-Auswahl entsteht).
  const [selectionPiecesRef, setSelectionPiecesRef] = useState(pieces);
  if (selectionPiecesRef !== pieces) {
    setSelectionPiecesRef(pieces);
    setSelectedIds((cur) => pruneSelection(cur, pieces));
  }
  // Einzelauswahl (Drehen/Spiegeln/Pfeiltasten) gilt nur bei genau einem ausgewählten Stück;
  // mit Umschalt+Klick lassen sich mehrere auswählen, die dann gemeinsam gelöscht werden.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  function setSelectedId(next: string | null | ((cur: string | null) => string | null)) {
    const value = typeof next === 'function' ? next(selectedId) : next;
    setSelectedIds(value === null ? [] : [value]);
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragState | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
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
      onTileCancel: () => setPaletteDrag(null),
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
    setSelectedId(null);
    setPointerPos(null);
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

  const contentWidthM = Math.max(
    pieces.reduce((m, p) => Math.max(m, p.x + p.w), 0),
    referenceFootprint ? referenceFootprint.x + referenceFootprint.widthM : 0,
  );
  const contentDepthM = Math.max(
    pieces.reduce((m, p) => Math.max(m, p.y + p.d), 0),
    referenceFootprint ? referenceFootprint.y + referenceFootprint.depthM : 0,
  );
  const canvasWidthM = Math.max(minCanvasWidthM ?? 0, MIN_CANVAS_WIDTH_M, contentWidthM + BUFFER_M);
  const canvasDepthM = Math.max(MIN_CANVAS_DEPTH_M, contentDepthM + BUFFER_M);
  const viewBox = `${-PAD} ${-PAD} ${canvasWidthM + PAD * 2} ${canvasDepthM + PAD * 2}`;

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

  // Bedient sowohl den Klick-Bewaffnen-Hover als auch das Ziehen aus der Palette (sobald der
  // Cursor über dem Canvas ist) — eine einzige Vorschau-Quelle für beide Wege.
  function previewForPayload(payload: ToolPayload | null): (FilledPiece & { valid?: boolean })[] | null {
    if (!payload || !pointerPos) return null;
    const { w, d } = payloadSize(payload);
    if (altHeld) {
      const free = placeUnsnapped(pieces, w, d, pointerPos.x - w / 2, pointerPos.y - d / 2);
      return [{ ...payloadToFilled(payload, free.x, free.y), valid: free.valid }];
    }
    const pos = findFreePosition(pieces, w, d, pointerPos.x - w / 2, pointerPos.y - d / 2, undefined, placementOptions());
    return [payloadToFilled(payload, pos.x, pos.y)];
  }

  // arm(null) beim Start eines Paletten-Ziehens sorgt dafür, dass armed/paletteDrag nie
  // gleichzeitig aktiv sind — das `??` ist defensiv, nicht tragend.
  const activePayload = armed ?? (paletteDrag?.overCanvas ? paletteDrag.payload : null);
  const previewPieces = previewForPayload(activePayload);

  // Smart Guides: Live-Fläche des gerade bewegten oder platzierten Einzelstücks. Beim Ziehen eines
  // Einzelstücks ist es das Ziel, sonst das Vorschau-Stück. Gruppen-Drag zeigt bewusst keine Guides.
  const draggedPiece = drag?.moved && drag.target && !drag.group ? pieces.find((p) => p.id === drag.id) ?? null : null;
  const previewSingle = previewPieces?.length === 1 ? previewPieces[0] : null;
  const liveRect: Rect | null =
    draggedPiece && drag?.target
      ? { x: drag.target.x, y: drag.target.y, w: draggedPiece.w, d: draggedPiece.d }
      : previewSingle
        ? { x: previewSingle.x, y: previewSingle.y, w: previewSingle.w, d: previewSingle.d }
        : null;
  const others = liveRect ? pieces.filter((p) => !(draggedPiece && p.id === draggedPiece.id)) : [];
  const liveGeometry = liveRect
    ? {
        guides: alignmentGuides(liveRect, others),
        gaps: nearestGaps(liveRect, others),
        total: others.length > 0 ? unionBounds([...others, liveRect]) : null,
        px: metersPerPx,
      }
    : null;

  // Reine Platzier-Funktion ohne Seiteneffekt auf armed/paletteDrag — das bleibt Sache der
  // Aufrufer (Klick-Platzieren-Pfad, Paletten-Ziehen UND Tastatur-Platzieren nutzen dieselbe
  // Logik, nur die Umrechnung von Bildschirm- zu Meter-Koordinaten unterscheidet sich).
  // free=true (Alt): ohne Einrasten an der freien Lage; liegt sie auf einem anderen Stück, wird nichts abgelegt.
  function commitPayloadAtPoint(payload: ToolPayload, pos: { x: number; y: number }, free = false) {
    const { w, d } = payloadSize(payload);
    if (free) {
      const exact = placeUnsnapped(pieces, w, d, pos.x - w / 2, pos.y - d / 2);
      if (!exact.valid) {
        showBlockedMessage('Dort ist kein Platz – nichts platziert.');
        return;
      }
      onAddPieces([payloadToFilled(payload, exact.x, exact.y)]);
      return;
    }
    const target = findFreePosition(pieces, w, d, pos.x - w / 2, pos.y - d / 2, undefined, placementOptions());
    onAddPieces([payloadToFilled(payload, target.x, target.y)]);
  }

  function commitPayloadAt(payload: ToolPayload, clientX: number, clientY: number, free = false) {
    commitPayloadAtPoint(payload, svgPointFromClient(clientX, clientY), free);
  }

  function handlePaletteButtonPointerDown(e: React.PointerEvent<HTMLButtonElement>, payload: ToolPayload) {
    if (!isPrimaryButton(e)) return;
    suppressNextClickRef.current = false;
    arm(null);
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
    dragThrottle.cancel();
    dragRef.current = null;
    setDrag(null);
  }

  // Mehrere Callback-Aufrufe als ein Undo-Schritt (fällt ohne onTransact auf direkten Aufruf zurück).
  function batch(fn: () => void) {
    if (onTransact) onTransact(fn);
    else fn();
  }

  // Der Greif-Offset bleibt erhalten: das Stück springt nicht mit der Mitte an den Cursor.
  const pieceDrag = usePointerDrag<Piece2D>({
    onStart: (e, piece) => {
      if (armed) return false;
      e.stopPropagation();
      if (e.shiftKey) {
        setSelectedIds((cur) => (cur.includes(piece.id) ? cur.filter((id) => id !== piece.id) : [...cur, piece.id]));
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
      };
      dragRef.current = next;
      setDrag(next);
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
          ({ dx, dy } = snapGroupDelta(pieces, selectedIds, x - cur.group.startX, y - cur.group.startY, SNAP_TOLERANCE_PX * metersPerPx));
        }
        const valid = checkGroupMove(pieces, selectedIds, dx, dy) === 'ok';
        if (cur.moved && cur.group.dx === dx && cur.group.dy === dy && cur.group.valid === valid) return;
        next = { ...cur, moved: true, group: { ...cur.group, dx, dy, valid } };
      } else {
        const target = e.altKey
          ? placeUnsnapped(pieces, piece.w, piece.d, x - cur.grabOffset.x, y - cur.grabOffset.y, piece.id)
          : { ...findFreePosition(pieces, piece.w, piece.d, x - cur.grabOffset.x, y - cur.grabOffset.y, piece.id, placementOptions()), valid: true };
        if (cur.moved && cur.target && cur.target.x === target.x && cur.target.y === target.y && cur.target.valid === target.valid) return;
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
      if (!cur) return;
      if (cur.group) {
        const { dx, dy, valid } = cur.group;
        if (cur.moved && valid && (dx !== 0 || dy !== 0)) {
          if (onMovePieces) onMovePieces(selectedIds, dx, dy);
          else batch(() => pieces.filter((p) => selectedIds.includes(p.id)).forEach((p) => onMovePiece(p.id, round1(p.x + dx), round1(p.y + dy))));
        } else if (cur.moved && !valid) {
          showBlockedMessage('Dort ist kein Platz – die Auswahl würde andere Stücke überlappen. Nichts verschoben.');
        }
      } else if (cur.moved && cur.target?.valid === false) {
        showBlockedMessage('Dort ist kein Platz – das Stück würde ein anderes überlappen. Nichts verschoben.');
      } else if (cur.moved && cur.target) {
        onMovePiece(piece.id, cur.target.x, cur.target.y);
        setSelectedId(piece.id);
      } else if (!session.moved) {
        setSelectedId((c) => (c === piece.id ? null : piece.id));
      }
    },
    onCancel: cancelPieceDrag,
  });

  const selectedPiece = selectedId ? pieces.find((p) => p.id === selectedId) ?? null : null;

  function rotateSelected() {
    // Mehrfachauswahl: als Block um die Mitte drehen (nur mit onReplaceAll).
    if (selectedIds.length > 1 && onReplaceAll) {
      const next = rotateGroupAroundCenter(pieces, selectedIds);
      if (next === null) showBlockedMessage('Drehen nicht möglich – die gedrehte Auswahl würde andere Stücke überlappen.');
      else onReplaceAll(next);
      return;
    }
    if (!selectedPiece) return;
    // Mit onReplaceAll um den Mittelpunkt drehen, passend zu Ziehen (Kanten-Fang, Nachrücken).
    if (onReplaceAll) {
      onReplaceAll(rotatePieceAroundCenter(pieces, selectedPiece.id, placementOptions()));
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
    if (fitsAt(pieces, selectedPiece.x, selectedPiece.y, rotatedW, rotatedD, selectedPiece.id)) {
      onRotatePiece(selectedPiece.id);
      return;
    }
    // Passt an der aktuellen Stelle gedreht nicht (die Bounding-Box wächst/schrumpft je nach
    // Achse) — statt hart zu blockieren, wie beim Ziehen die nächstgelegene freie Stelle für die
    // gedrehten Maße suchen und dorthin rücken. findFreePosition liefert für ein Einzelstück
    // immer ein Ergebnis (siehe customShape.ts), ein echter Fehlerfall entfällt damit.
    const target = findFreePosition(pieces, rotatedW, rotatedD, selectedPiece.x, selectedPiece.y, selectedPiece.id);
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
    if (onRemovePieces) onRemovePieces(selectedIds);
    else batch(() => selectedIds.forEach((id) => onRemovePiece(id)));
    setSelectedIds([]);
  }

  // Kopiert die Auswahl als Block nach rechts (erste freie Stelle). Ein Einfüge-Aufruf = ein Undo-Schritt.
  // Die Auswahl springt auf die Kopie, so baut wiederholtes Strg+D die Reihe nach rechts weiter.
  function duplicateSelected() {
    if (selectedIds.length === 0) return;
    const copy = duplicateWithOffset(pieces, selectedIds);
    if (!copy) {
      showBlockedMessage('Kein freier Platz zum Duplizieren gefunden.');
      return;
    }
    if (onInsertPieces) {
      const withIds = copy.map((p) => ({ ...p, id: makePieceId() }));
      onInsertPieces(withIds);
      setSelectedIds(withIds.map((p) => p.id));
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
    onShiftAll(dx);
  }

  // Pfeil-Nudge für die ganze Auswahl (ein oder mehrere Stücke): ein Undo-Schritt pro Tastendruck,
  // bei Blockade (Rand oder Kollision) Meldung statt stiller Abbruch — und kein Undo-Eintrag.
  function nudgeSelection(ux: number, uy: number, step: number) {
    const dx = round1(ux * step);
    const dy = round1(uy * step);
    const result = checkGroupMove(pieces, selectedIds, dx, dy);
    if (result === 'out-of-bounds') {
      showBlockedMessage('Weiter geht es nicht – der Plan beginnt hier.');
      return;
    }
    if (result === 'collision') {
      showBlockedMessage('Dort ist kein Platz – ein anderes Stück liegt im Weg.');
      return;
    }
    if (onMovePieces) {
      onMovePieces(selectedIds, dx, dy);
      return;
    }
    batch(() => pieces.filter((p) => selectedIds.includes(p.id)).forEach((p) => onMovePiece(p.id, round1(p.x + dx), round1(p.y + dy))));
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
      arm(null);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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
    if (action === 'undo' || action === 'redo') {
      e.preventDefault();
      if (action === 'undo') onUndo?.();
      else onRedo?.();
      return;
    }
    if (action === 'selectAll') {
      e.preventDefault();
      arm(null);
      setSelectedIds(pieces.map((p) => p.id));
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
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const payload = parseClipboard(text) ?? getMemoryClipboard();
    if (!payload) return;
    e.preventDefault();
    pasteHandledRef.current = true;
    pastePayload(payload);
  }

  // Fügt die Zwischenablage an der Mausposition ein (sonst rechts neben dem Bestand). Die Kopie wird danach ausgewählt.
  function pastePayload(payload: PiecesClipboardPayload) {
    const placed = placeClipboard(piecesRef.current, payload, lastPointerRef.current);
    if (!placed) {
      showBlockedMessage('Kein freier Platz zum Einfügen gefunden.');
      return;
    }
    if (onInsertPieces) {
      const withIds = placed.map((p) => ({ ...p, id: makePieceId() }));
      onInsertPieces(withIds);
      setSelectedIds(withIds.map((p) => p.id));
      return;
    }
    onAddPieces(placed);
  }

  // Statuszeile der Toolbar: sagt, was gerade passiert bzw. was als Nächstes zu tun ist.
  function statusText(): string {
    return armed
      ? 'Jetzt auf den Plan klicken, um das Stück zu platzieren.'
      : selectedPiece
        ? `Ausgewählt: ${formatMeters(selectedPiece.w, 2)}×${formatMeters(selectedPiece.d, 2)} m${
            selectedPiece.corner !== undefined && selectedPiece.w !== selectedPiece.d
              ? ` (${triangleHand(selectedPiece.corner, selectedPiece.w, selectedPiece.d)})`
              : ''
          }`
        : selectedIds.length > 1
          ? `${selectedIds.length} Stücke ausgewählt`
          : 'Stück anklicken (Umschalt+Klick für mehrere) oder unten eins wählen.';
  }

  // Nach jedem Commit die aktuellen Handler für die Palette aktualisieren (siehe paletteCallbacks);
  // vor jedem Ereignis ist der Ref damit aktuell, ohne während des Renders auf den Ref zuzugreifen.
  useLayoutEffect(() => {
    paletteHandlersRef.current = { down: handlePaletteButtonPointerDown, move: handlePaletteButtonPointerMove, up: handlePaletteButtonPointerUp, arm };
  });
  // Stückliste für den Rückfall-Timer beim Einfügen aktuell halten (siehe piecesRef).
  useLayoutEffect(() => {
    piecesRef.current = pieces;
  });
  return (
    <div className="space-y-3" onKeyDown={handleEditorKeyDown} onPaste={handleEditorPaste}>
      <EditorToolbar
        statusText={statusText()}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        canRotate={!!armed || !!selectedPiece || (selectedIds.length > 1 && !!onReplaceAll)}
        onRotate={rotateCurrent}
        canDuplicate={selectedIds.length > 0}
        onDuplicate={duplicateSelected}
        showMirror={(armed?.kind === 'triangle' && armed.w !== armed.d) || (selectedPiece?.corner !== undefined && selectedPiece.w !== selectedPiece.d)}
        onMirror={mirrorCurrent}
        removeCount={selectedIds.length}
        onRemove={removeSelected}
        cancelLabel={armed ? 'Abbrechen' : selectedIds.length > 0 ? 'Abwählen' : null}
        onCancel={() => (armed ? arm(null) : setSelectedIds([]))}
        piecesCount={pieces.length}
        canShiftLeft={canShiftLeft}
        onShiftAll={shiftAll}
        shiftStepM={GRID_STEP_M}
        onClear={onClear ? handleClear : undefined}
      />
      {blockedMessage && (
        <div role="status" className="rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {blockedMessage}
        </div>
      )}
      {clearedSnack && pieces.length === 0 && (
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

      <div className="relative">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="block w-full h-auto max-h-[420px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] select-none"
        style={{ touchAction: 'none' }}
        role="img"
        aria-label="Bau-Editor — klicken und dann Tastatur nutzen (Pfeiltasten, Enter, R, Entf, Esc, 1–4, T; Kurzbefehle siehe unten)"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
        onPointerMove={(e) => {
          lastPointerRef.current = svgPointFromClient(e.clientX, e.clientY);
        }}
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
        {!armed && selectedIds.length > 0 && (
          <rect
            x={0}
            y={0}
            width={canvasWidthM}
            height={canvasDepthM}
            fill="transparent"
            onClick={() => setSelectedIds([])}
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
          const interactive = !armed && !paletteDrag;
          return (
            <PieceShape
              key={p.id}
              piece={{ ...p, shape: p.shape }}
              fill={sondermass ? `url(#pce-hatch-warning-${uid})` : `url(#pce-hatch-${uid})`}
              fillOpacity={isDragTarget ? 0.25 : 1}
              stroke={selectedIds.includes(p.id) ? 'var(--color-accent)' : 'var(--color-panel-stroke)'}
              strokeWidth={selectedIds.includes(p.id) ? 0.035 : 0.02}
              pointerEvents={interactive ? 'all' : 'none'}
              style={{ cursor: interactive ? 'grab' : 'default' }}
              {...pieceDrag.bind(p)}
            >
              <title>
                {formatMeters(p.w, 2)}×{formatMeters(p.d, 2)} m bei x={formatMeters(p.x, 2)}, y={formatMeters(p.y, 2)} m
              </title>
            </PieceShape>
          );
        })}

        <DragOverlay
          pieces={pieces}
          selectedIds={selectedIds}
          drag={drag}
          previewPieces={previewPieces}
          guides={liveGeometry?.guides ?? []}
          gaps={liveGeometry?.gaps ?? []}
          total={liveGeometry?.total ?? null}
          px={metersPerPx}
        />
      </svg>
      {pieces.length === 0 && !armed && !paletteDrag && (
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

      <PiecePalette armed={armed} hint="Teil auf den Plan ziehen oder anklicken und dann auf den Plan klicken. Beim Ziehen dreht R, Rechtsklick oder das Mausrad das Teil. Beim Ziehen zeigen Hilfslinien Fluchten, Abstände und das Gesamtmaß in m. Alt gedrückt halten: frei platzieren, ohne Einrasten." {...paletteCallbacks} />

      <ShortcutHelp />
    </div>
  );
}
