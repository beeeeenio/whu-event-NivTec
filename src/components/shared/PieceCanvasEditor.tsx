import { useEffect, useId, useRef, useState } from 'react';
import {
  findFreePosition,
  fitsAt,
  shiftPieces,
  type FilledPiece,
  type Piece2D,
} from '../../domain/customShape';
import { checkGroupMove, duplicateWithOffset } from '../../domain/pieceOps';
import { isSondermassPiece, TRIANGLE_PANEL_SIZE_M, QUARTER_CIRCLE_RADIUS_M, RECT_CATALOG } from '../../domain/panels';
import { mirrorTriangleCornerDiagonal, nextTriangleCorner, quarterCirclePath, triangleHand, trianglePoints } from '../../domain/triangle';
import type { TriangleCorner } from '../../domain/types';
import { formatMeters } from '../../lib/format';
import { dragThresholdPx, isPrimaryButton, shouldRotateOnWheel } from '../../lib/pointer';

type ToolPayload = { kind: 'piece'; w: number; d: number } | { kind: 'triangle'; corner: TriangleCorner; w: number; d: number } | { kind: 'viertelkreis'; corner: TriangleCorner };

interface Props {
  pieces: Piece2D[];
  onAddPieces: (pieces: FilledPiece[]) => void;
  onRemovePiece: (id: string) => void;
  onMovePiece: (id: string, x: number, y: number) => void;
  /** Verschiebt mehrere Stücke gemeinsam um (dx, dy) — ein Undo-Schritt für die ganze Auswahl. */
  onMovePieces?: (ids: string[], dx: number, dy: number) => void;
  /** Entfernt mehrere Stücke — ein Undo-Schritt. */
  onRemovePieces?: (ids: string[]) => void;
  onRotatePiece: (id: string) => void;
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
const ARROW_DELTA: Partial<Record<string, [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

const ACTION_BTN =
  'px-2.5 py-1 rounded-md text-sm border border-[var(--color-panel-stroke)] bg-[var(--color-surface)] text-[var(--color-text)] cursor-pointer select-none enabled:hover:border-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed';

const QUICK_WIDTHS = [2, 1.5, 1, 0.5] as const;

const fmtDim = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

interface GalleryTile {
  key: string;
  label: string;
  payload: ToolPayload;
  geometry: ShapeGeometry;
}

const GALLERY_GROUPS: { title: string; tiles: GalleryTile[] }[] = [
  {
    title: 'Rechtecke',
    tiles: [...RECT_CATALOG]
      .sort((a, b) => b.w - a.w || b.d - a.d)
      .map((r) => ({
        key: `rect-${r.w}x${r.d}`,
        label: `${fmtDim(r.w)}×${fmtDim(r.d)}`,
        payload: { kind: 'piece', w: r.w, d: r.d } as ToolPayload,
        geometry: { x: 0, y: 0, w: r.w, d: r.d },
      })),
  },
  {
    title: 'Dreiecke',
    tiles: [
      { key: 'tri-1x1', label: '1×1', payload: { kind: 'triangle', corner: 'tl', w: 1, d: 1 }, geometry: { x: 0, y: 0, w: 1, d: 1, corner: 'tl' } },
      { key: 'tri-2x1', label: '2×1', payload: { kind: 'triangle', corner: 'tl', w: 2, d: 1 }, geometry: { x: 0, y: 0, w: 2, d: 1, corner: 'tl' } },
    ],
  },
  {
    title: 'Rund',
    tiles: [
      {
        key: 'quarter',
        label: 'R 1',
        payload: { kind: 'viertelkreis', corner: 'tl' },
        geometry: { x: 0, y: 0, w: QUARTER_CIRCLE_RADIUS_M, d: QUARTER_CIRCLE_RADIUS_M, corner: 'tl', shape: 'viertelkreis' },
      },
    ],
  },
];

function payloadMatches(armed: ToolPayload | null, tile: ToolPayload): boolean {
  if (!armed || armed.kind !== tile.kind) return false;
  if (armed.kind === 'piece' && tile.kind === 'piece') return armed.w === tile.w && armed.d === tile.d;
  if (armed.kind === 'triangle' && tile.kind === 'triangle') return armed.w === tile.w && armed.d === tile.d;
  return true;
}

interface ShapeGeometry {
  x: number;
  y: number;
  w: number;
  d: number;
  corner?: TriangleCorner;
  shape?: string;
}

/** Rendert ein Stück (egal ob platziert, Geist beim Ziehen oder Vorschau) als `<rect>` oder,
 *  bei einem Dreieckpodest, als `<polygon>` mit den 3 echten Eckpunkten — eine Stelle statt
 *  vierfach dupliziert (platzierte Stücke, Verschiebe-Ziel-Geist, Platzier-/Zieh-Vorschau). */
function PieceShape({
  piece,
  fill,
  fillOpacity,
  stroke,
  strokeWidth,
  strokeDasharray,
  pointerEvents,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  children,
}: {
  piece: ShapeGeometry;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  pointerEvents?: 'all' | 'none';
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<SVGElement>) => void;
  onLostPointerCapture?: (e: React.PointerEvent<SVGElement>) => void;
  children?: React.ReactNode;
}) {
  const shared = {
    fill,
    fillOpacity,
    stroke,
    strokeWidth,
    strokeDasharray,
    pointerEvents,
    style,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
  };
  if (piece.corner === undefined) {
    return (
      <rect x={piece.x} y={piece.y} width={piece.w} height={piece.d} {...shared}>
        {children}
      </rect>
    );
  }
  if (piece.shape === 'viertelkreis') {
    return (
      <path d={quarterCirclePath(piece, piece.corner)} {...shared}>
        {children}
      </path>
    );
  }
  const points = trianglePoints(piece, piece.corner)
    .map((pt) => `${pt.x},${pt.y}`)
    .join(' ');
  return (
    <polygon points={points} {...shared}>
      {children}
    </polygon>
  );
}

/** Maß-Beschriftung wie auf einem echten Aufmaßblatt — folgt einem einzelnen Stück
 *  beim Ziehen/Platzieren-Vorschau. */
function DimensionLabel({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  return (
    <text
      x={x + w / 2}
      y={y - 0.12}
      fontSize={0.16}
      textAnchor="middle"
      fill="var(--color-accent)"
      fontFamily="var(--font-mono)"
      style={{ pointerEvents: 'none' }}
    >
      {formatMeters(w, 2)}×{formatMeters(d, 2)} m
    </text>
  );
}

interface DragState {
  id: string;
  pointerType: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  target: { x: number; y: number } | null;
  /** Greifpunkt minus Stück-Ursprung (Meter), damit das Stück nicht mit der Mitte an den Cursor springt. */
  grabOffset: { x: number; y: number };
  /** Nur bei gemeinsamem Verschieben mehrerer ausgewählter Stücke: Startpunkt (Meter) und Versatz. */
  group?: { startX: number; startY: number; dx: number; dy: number; valid: boolean };
}

interface PaletteDragState {
  payload: ToolPayload;
  pointerType: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  overCanvas: boolean;
}

export function PieceCanvasEditor({
  pieces,
  onAddPieces,
  onRemovePiece,
  onMovePiece,
  onMovePieces,
  onRemovePieces,
  onRotatePiece,
  onMirrorPiece,
  onShiftAll,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  frontEdgeLabel = 'Vorderkante',
  minCanvasWidthM,
  referenceFootprint,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const [armed, setArmedState] = useState<ToolPayload | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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

  // Bedient sowohl den Klick-Bewaffnen-Hover als auch das Ziehen aus der Palette (sobald der
  // Cursor über dem Canvas ist) — eine einzige Vorschau-Quelle für beide Wege.
  function previewForPayload(payload: ToolPayload | null): FilledPiece[] | null {
    if (!payload || !pointerPos) return null;
    if (payload.kind === 'piece') {
      const pos = findFreePosition(pieces, payload.w, payload.d, pointerPos.x - payload.w / 2, pointerPos.y - payload.d / 2);
      return [{ x: pos.x, y: pos.y, w: payload.w, d: payload.d }];
    }
    if (payload.kind === 'viertelkreis') {
      const r = QUARTER_CIRCLE_RADIUS_M;
      const pos = findFreePosition(pieces, r, r, pointerPos.x - r / 2, pointerPos.y - r / 2);
      return [{ x: pos.x, y: pos.y, w: r, d: r, corner: payload.corner, shape: 'viertelkreis' }];
    }
    const pos = findFreePosition(pieces, payload.w, payload.d, pointerPos.x - payload.w / 2, pointerPos.y - payload.d / 2);
    return [{ x: pos.x, y: pos.y, w: payload.w, d: payload.d, corner: payload.corner }];
  }

  // arm(null) beim Start eines Paletten-Ziehens sorgt dafür, dass armed/paletteDrag nie
  // gleichzeitig aktiv sind — das `??` ist defensiv, nicht tragend.
  const activePayload = armed ?? (paletteDrag?.overCanvas ? paletteDrag.payload : null);
  const previewPieces = previewForPayload(activePayload);

  // Reine Platzier-Funktion ohne Seiteneffekt auf armed/paletteDrag — das bleibt Sache der
  // Aufrufer (Klick-Platzieren-Pfad, Paletten-Ziehen UND Tastatur-Platzieren nutzen dieselbe
  // Logik, nur die Umrechnung von Bildschirm- zu Meter-Koordinaten unterscheidet sich).
  function commitPayloadAtPoint(payload: ToolPayload, pos: { x: number; y: number }) {
    if (payload.kind === 'piece') {
      const target = findFreePosition(pieces, payload.w, payload.d, pos.x - payload.w / 2, pos.y - payload.d / 2);
      onAddPieces([{ x: target.x, y: target.y, w: payload.w, d: payload.d }]);
    } else if (payload.kind === 'viertelkreis') {
      const r = QUARTER_CIRCLE_RADIUS_M;
      const target = findFreePosition(pieces, r, r, pos.x - r / 2, pos.y - r / 2);
      onAddPieces([{ x: target.x, y: target.y, w: r, d: r, corner: payload.corner, shape: 'viertelkreis' }]);
    } else {
      const target = findFreePosition(pieces, payload.w, payload.d, pos.x - payload.w / 2, pos.y - payload.d / 2);
      onAddPieces([{ x: target.x, y: target.y, w: payload.w, d: payload.d, corner: payload.corner }]);
    }
  }

  function commitPayloadAt(payload: ToolPayload, clientX: number, clientY: number) {
    commitPayloadAtPoint(payload, svgPointFromClient(clientX, clientY));
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
    if (pd.overCanvas) commitPayloadAt(pd.payload, e.clientX, e.clientY);
    arm(null);
  }

  // Drehen, während ein Stück noch aus der Palette gezogen wird (vor dem Loslassen) — der
  // Button behält seinen Fokus über die ganze Zieh-Geste (Pointer-Capture ändert daran nichts),
  // daher reicht ein normaler onKeyDown hier.
  function rotatePaletteDrag() {
    setPaletteDrag((d) => {
      if (!d) return d;
      if (d.payload.kind === 'piece') return { ...d, payload: { kind: 'piece', w: d.payload.d, d: d.payload.w } };
      if (d.payload.kind === 'triangle') return { ...d, payload: { kind: 'triangle', corner: nextTriangleCorner(d.payload.corner), w: d.payload.d, d: d.payload.w } };
      if (d.payload.kind === 'viertelkreis') return { ...d, payload: { kind: 'viertelkreis', corner: nextTriangleCorner(d.payload.corner) } };
      return d;
    });
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

  // Esc bricht auch ein laufendes Ziehen eines platzierten Stücks ab — ohne Commit, ohne Undo-Eintrag.
  const pieceDragging = drag !== null;
  useEffect(() => {
    if (!pieceDragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pieceDragging]);

  // Der Greif-Offset bleibt erhalten: das Stück springt nicht mit der Mitte an den Cursor.
  function handlePiecePointerDown(e: React.PointerEvent<SVGElement>, piece: Piece2D) {
    if (!isPrimaryButton(e)) return;
    if (armed) return;
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedIds((cur) => (cur.includes(piece.id) ? cur.filter((id) => id !== piece.id) : [...cur, piece.id]));
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture kann ohne aktiven, vom Browser registrierten Pointer werfen
      // (z.B. bei synthetisch erzeugten Events) — das Ziehen funktioniert trotzdem.
    }
    const inGroup = selectedIds.length > 1 && selectedIds.includes(piece.id);
    const start = svgPointFromClient(e.clientX, e.clientY);
    setDrag({
      id: piece.id,
      pointerType: e.pointerType,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      target: null,
      grabOffset: { x: start.x - piece.x, y: start.y - piece.y },
      group: inGroup ?{ startX: start.x, startY: start.y, dx: 0, dy: 0, valid: true } : undefined,
    });
  }

  function handlePiecePointerMove(e: React.PointerEvent<SVGElement>, piece: Piece2D) {
    if (!drag || drag.id !== piece.id) return;
    const movedPx = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
    if (movedPx < dragThresholdPx(drag.pointerType)) return;
    const { x, y } = svgPointFromClient(e.clientX, e.clientY);
    if (drag.group) {
      const moving = pieces.filter((p) => selectedIds.includes(p.id));
      const snap = (v: number) => Math.round(v / GRID_STEP_M) * GRID_STEP_M;
      const minX = Math.min(...moving.map((p) => p.x));
      const minY = Math.min(...moving.map((p) => p.y));
      const dx = Math.max(-minX, snap(x - drag.group.startX));
      const dy = Math.max(-minY, snap(y - drag.group.startY));
      const valid = checkGroupMove(pieces, selectedIds, dx, dy) === 'ok';
      if (drag.moved && drag.group.dx === dx && drag.group.dy === dy && drag.group.valid === valid) return;
      setDrag((d) => (d && d.group ? { ...d, moved: true, group: { ...d.group, dx, dy, valid } } : d));
      return;
    }
    const target = findFreePosition(pieces, piece.w, piece.d, x - drag.grabOffset.x, y - drag.grabOffset.y, piece.id);
    if (drag.moved && drag.target && drag.target.x === target.x && drag.target.y === target.y) return;
    setDrag((d) => (d ? { ...d, moved: true, target } : d));
  }

  function handlePiecePointerUp(piece: Piece2D) {
    if (drag?.id === piece.id && drag.group) {
      const { dx, dy, valid } = drag.group;
      if (drag.moved && valid && (dx !== 0 || dy !== 0)) {
        if (onMovePieces) onMovePieces(selectedIds, dx, dy);
        else pieces.filter((p) => selectedIds.includes(p.id)).forEach((p) => onMovePiece(p.id, round1(p.x + dx), round1(p.y + dy)));
      } else if (drag.moved && !valid) {
        showBlockedMessage('Dort ist kein Platz – die Auswahl würde andere Stücke überlappen. Nichts verschoben.');
      }
    } else if (drag?.id === piece.id) {
      if (drag.moved && drag.target) {
        onMovePiece(piece.id, drag.target.x, drag.target.y);
        setSelectedId(piece.id);
      } else {
        setSelectedId((cur) => (cur === piece.id ? null : piece.id));
      }
    }
    setDrag(null);
  }

  // Abbruch eines laufenden Ziehens (Esc, pointercancel, verlorene Pointer-Capture): nur verwerfen,
  // nichts committen, daher kein Undo-Schritt. lostpointercapture feuert erst nach pointerup, das
  // bereits committet hat — dort ist setDrag(null) nur noch ein harmloses Aufräumen.
  function cancelPieceDrag() {
    setDrag(null);
  }

  const selectedPiece =selectedId ? pieces.find((p) => p.id === selectedId) ?? null : null;

  function rotateSelected() {
    if (!selectedPiece) return;
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
    onMovePiece(selectedPiece.id, target.x, target.y);
    onRotatePiece(selectedPiece.id);
  }

  function rotateCurrent() {
    if (armed) {
      setArmedState((cur) => {
        if (!cur) return cur;
        if (cur.kind === 'piece') return { kind: 'piece', w: cur.d, d: cur.w };
        if (cur.kind === 'triangle') return { kind: 'triangle', corner: nextTriangleCorner(cur.corner), w: cur.d, d: cur.w };
        return { kind: 'viertelkreis', corner: nextTriangleCorner(cur.corner) };
      });
      return;
    }
    rotateSelected();
  }

  function mirrorCurrent() {
    if (armed?.kind === 'triangle') {
      setArmedState((cur) =>
        cur?.kind === 'triangle' ? { kind: 'triangle', corner: mirrorTriangleCornerDiagonal(cur.corner), w: cur.d, d: cur.w } : cur,
      );
      return;
    }
    if (selectedPiece && onMirrorPiece) onMirrorPiece(selectedPiece.id);
  }

  function removeSelected() {
    if (selectedIds.length === 0) return;
    if (onRemovePieces) onRemovePieces(selectedIds);
    else selectedIds.forEach((id) => onRemovePiece(id));
    setSelectedIds([]);
  }

  // Kopiert die Auswahl als Block nach rechts (erste freie Stelle). Ein set()-Aufruf = ein Undo-Schritt;
  // die Auswahl bleibt beim Original, so baut wiederholtes Strg+D eine Reihe.
  function duplicateSelected() {
    if (selectedIds.length === 0) return;
    const copy = duplicateWithOffset(pieces, selectedIds);
    if (!copy) {
      showBlockedMessage('Kein freier Platz zum Duplizieren gefunden.');
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
    pieces.filter((p) => selectedIds.includes(p.id)).forEach((p) => onMovePiece(p.id, round1(p.x + dx), round1(p.y + dy)));
  }

  // Tastatur-Bedienung des Plans, nur aktiv wenn das SVG fokussiert ist (Klick oder Tab hinein) —
  // dadurch keine Kollision mit Eingabefeldern anderswo auf der Seite (z.B. Konfigurationsname).
  // Pfeiltasten bewegen die Auswahl (Umschalt = 1 m, blockiert mit Meldung) oder — bei bewaffnetem
  // Werkzeug — einen Tastatur-Cursor (dieselbe pointerPos,
  // die auch die Maus-Vorschau treibt), Enter/Leertaste platziert dort. R dreht, Entf/Rücktaste
  // entfernt, Esc bricht ab. 1–4 wählen die Plattengrößen in derselben Reihenfolge wie die
  // Segmented-Control, T bewaffnet das Dreieckpodest.
  function handleCanvasKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'Escape') {
      setDrag(null);
      setPaletteDrag(null);
      arm(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) onRedo?.();
      else onUndo?.();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      onRedo?.();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); arm(null); setSelectedIds(pieces.map((p) => p.id)); return; }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (selectedPiece) {
        rotateSelected();
      } else if (armed?.kind === 'piece') {
        setArmedState((cur) => (cur?.kind === 'piece' ? { kind: 'piece', w: cur.d, d: cur.w } : cur));
      } else if (armed?.kind === 'triangle') {
        setArmedState((cur) => (cur?.kind === 'triangle' ? { kind: 'triangle', corner: nextTriangleCorner(cur.corner), w: cur.d, d: cur.w } : cur));
      } else if (armed?.kind === 'viertelkreis') {
        setArmedState((cur) => (cur?.kind === 'viertelkreis' ? { kind: 'viertelkreis', corner: nextTriangleCorner(cur.corner) } : cur));
      }
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
      commitPayloadAtPoint(armed, pointerPos);
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

  return (
    <div className="space-y-3">
      <div
        role="toolbar"
        aria-label="Aktionen"
        className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2"
      >
        <span role="status" className="mr-1 text-xs text-[var(--color-text-muted)]">
          {armed
            ? 'Jetzt auf den Plan klicken, um das Stück zu platzieren.'
            : selectedPiece
              ? `Ausgewählt: ${formatMeters(selectedPiece.w, 2)}×${formatMeters(selectedPiece.d, 2)} m${
                  selectedPiece.corner !== undefined && selectedPiece.w !== selectedPiece.d
                    ? ` (${triangleHand(selectedPiece.corner, selectedPiece.w, selectedPiece.d)})`
                    : ''
                }`
              : selectedIds.length > 1
                ? `${selectedIds.length} Stücke ausgewählt`
                : 'Stück anklicken (Umschalt+Klick für mehrere) oder unten eins wählen.'}
        </span>
        {onUndo && (
          <button type="button" onClick={onUndo} disabled={!canUndo} title="Rückgängig (Strg/Cmd+Z)" aria-label="Rückgängig" className={ACTION_BTN}>
            ↶
          </button>
        )}
        {onRedo && (
          <button type="button" onClick={onRedo} disabled={!canRedo} title="Wiederholen (Strg/Cmd+Umschalt+Z)" aria-label="Wiederholen" className={ACTION_BTN}>
            ↷
          </button>
        )}
        <button
          type="button"
          onClick={rotateCurrent}
          disabled={!armed && !selectedPiece}
          title="Drehen (R) — wirkt auf das gewählte oder gerade aufgenommene Stück"
          className={ACTION_BTN}
        >
          ⤾ Drehen
        </button>
        <button type="button" onClick={duplicateSelected} disabled={selectedIds.length === 0} title="Duplizieren (Strg/Cmd+D)" className={ACTION_BTN}>⧉ Duplizieren</button>
        {((armed?.kind === 'triangle' && armed.w !== armed.d) || (selectedPiece?.corner !== undefined && selectedPiece.w !== selectedPiece.d)) && (
          <button type="button" onClick={mirrorCurrent} title="Spiegeln — wechselt links/rechts" className={ACTION_BTN}>
            ⇋ Spiegeln
          </button>
        )}
        <button
          type="button"
          onClick={removeSelected}
          disabled={selectedIds.length === 0}
          title="Entfernen (Entf)"
          className={`${ACTION_BTN} enabled:hover:!border-[var(--color-danger)] enabled:hover:!text-[var(--color-danger)]`}
        >
          {selectedIds.length > 1 ? `Entfernen (${selectedIds.length})` : 'Entfernen'}
        </button>
        {(armed || selectedIds.length > 0) && (
          <button
            type="button"
            onClick={() => (armed ? arm(null) : setSelectedIds([]))}
            className="px-2 py-1 text-xs text-[var(--color-text-muted)] underline"
          >
            {armed ? 'Abbrechen' : 'Abwählen'}
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pieces.length > 0 && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Ganze Fläche verschieben">
              <span className="text-xs text-[var(--color-text-muted)]">Alles verschieben</span>
              <button
                type="button"
                onClick={() => shiftAll(-GRID_STEP_M)}
                disabled={!canShiftLeft}
                title={canShiftLeft ? 'Alle Stücke gemeinsam 0,5 m nach links (Umschalt+← ohne Auswahl)' :'Die Fläche liegt schon am linken Rand'}
                aria-label="Alle Stücke 0,5 m nach links verschieben"
                className={ACTION_BTN}
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => shiftAll(GRID_STEP_M)}
                title="Alle Stücke gemeinsam 0,5 m nach rechts (Umschalt+→ ohne Auswahl)"
                aria-label="Alle Stücke 0,5 m nach rechts verschieben"
                className={ACTION_BTN}
              >
                →
              </button>
            </div>
          )}
          {onClear && pieces.length > 0 && (
            <button type="button" onClick={onClear} title="Leert den ganzen Plan" className={`${ACTION_BTN} enabled:hover:!border-[var(--color-danger)] enabled:hover:!text-[var(--color-danger)]`}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>
      {blockedMessage && (
        <div role="status" className="rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {blockedMessage}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-auto max-h-[420px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] select-none"
        style={{ touchAction: 'none' }}
        role="img"
        aria-label="Bau-Editor — klicken und dann Tastatur nutzen (Pfeiltasten, Enter, R, Entf, Esc, 1–4, T; Kurzbefehle siehe unten)"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
      >
        <defs>
          <pattern id={`pce-hatch-${uid}`} width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
            <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch)" strokeWidth={0.02} opacity={0.32} />
          </pattern>
          <pattern id={`pce-hatch-warning-${uid}`} width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
            <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch-warning)" strokeWidth={0.022} opacity={0.42} />
          </pattern>
          <pattern id={`pce-dotgrid-${uid}`} width={GRID_STEP_M} height={GRID_STEP_M} patternUnits="userSpaceOnUse">
            <circle cx={GRID_STEP_M / 2} cy={GRID_STEP_M / 2} r={0.012} fill="var(--color-grid-line)" />
          </pattern>
        </defs>

        <rect
          x={-PAD}
          y={-PAD}
          width={canvasWidthM + PAD * 2}
          height={canvasDepthM + PAD * 2}
          fill={`url(#pce-dotgrid-${uid})`}
          pointerEvents="none"
        />
        {Array.from({ length: Math.floor(canvasWidthM) + 1 }, (_, i) => (
          <line key={`vmaj-${i}`} x1={i} y1={0} x2={i} y2={canvasDepthM} stroke="var(--color-grid-line-major)" strokeWidth={0.01} pointerEvents="none" />
        ))}
        {Array.from({ length: Math.floor(canvasDepthM) + 1 }, (_, i) => (
          <line key={`hmaj-${i}`} x1={0} y1={i} x2={canvasWidthM} y2={i} stroke="var(--color-grid-line-major)" strokeWidth={0.01} pointerEvents="none" />
        ))}

        <line x1={0} y1={0} x2={canvasWidthM} y2={0} stroke="var(--color-panel-stroke)" strokeWidth={0.04} />
        <text
          x={canvasWidthM / 2}
          y={-0.18}
          fontSize={0.22}
          textAnchor="middle"
          fill="var(--color-text-muted)"
          fontFamily="var(--font-display)"
        >
          {frontEdgeLabel}
        </text>

        <rect
          x={0}
          y={0}
          width={canvasWidthM}
          height={canvasDepthM}
          fill="transparent"
          pointerEvents={armed ? 'all' : 'none'}
          onPointerMove={(e) => {
            if (!armed) return;
            setPointerPos(svgPointFromClient(e.clientX, e.clientY));
          }}
          onClick={(e) => {
            if (!armed) return;
            commitPayloadAt(armed, e.clientX, e.clientY);
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
              onPointerDown={(e) => handlePiecePointerDown(e, p)}
              onPointerMove={(e) => handlePiecePointerMove(e, p)}
              onPointerUp={() => handlePiecePointerUp(p)}
              onPointerCancel={cancelPieceDrag}
              onLostPointerCapture={cancelPieceDrag}
            >
              <title>
                {formatMeters(p.w, 2)}×{formatMeters(p.d, 2)} m bei x={formatMeters(p.x, 2)}, y={formatMeters(p.y, 2)} m
              </title>
            </PieceShape>
          );
        })}

        {drag?.group &&
          drag.moved &&
          pieces
            .filter((p) => selectedIds.includes(p.id))
            .map((p) => (
              <PieceShape
                key={`ghost-${p.id}`}
                piece={{ ...p, x: p.x + drag.group!.dx, y: p.y + drag.group!.dy }}
                fill={drag.group!.valid ? 'var(--color-accent)' : 'var(--color-danger)'}
                fillOpacity={drag.group!.valid ? 0.35 : 0.2}
                stroke={drag.group!.valid ? 'var(--color-accent)' : 'var(--color-danger)'}
                strokeWidth={0.03}
                strokeDasharray={drag.group!.valid ? undefined : '0.08 0.06'}
                style={{ pointerEvents: 'none' }}
              />
            ))}
        {drag?.target &&
          (() => {
            const dragged = pieces.find((p) => p.id === drag.id);
            const w = dragged?.w ?? 0;
            const d = dragged?.d ?? 0;
            return (
              <>
                <PieceShape
                  piece={{ x: drag.target.x, y: drag.target.y, w, d, corner: dragged?.corner, shape: dragged?.shape }}
                  fill="var(--color-accent)"
                  fillOpacity={0.35}
                  stroke="var(--color-accent)"
                  strokeWidth={0.03}
                  style={{ pointerEvents: 'none' }}
                />
                <DimensionLabel x={drag.target.x} y={drag.target.y} w={w} d={d} />
              </>
            );
          })()}

        {previewPieces?.map((p, idx) => (
          <PieceShape
            key={idx}
            piece={p}
            fill="var(--color-accent)"
            fillOpacity={0.35}
            stroke="var(--color-accent)"
            strokeWidth={0.03}
            style={{ pointerEvents: 'none' }}
          />
        ))}
        {previewPieces?.length === 1 && (
          <DimensionLabel x={previewPieces[0].x} y={previewPieces[0].y} w={previewPieces[0].w} d={previewPieces[0].d} />
        )}

      </svg>

      <div className="space-y-2" style={{ fontFamily: 'var(--font-display)' }}>
        <p className="text-xs text-[var(--color-text-muted)]">
          Teil auf den Plan ziehen oder anklicken und dann auf den Plan klicken. Beim Ziehen dreht R, Rechtsklick oder das Mausrad das Teil.
        </p>
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
        {[GALLERY_GROUPS.slice(0, 1), GALLERY_GROUPS.slice(1)].map((column, colIdx) => (
        <div key={colIdx} className={`flex gap-x-6 gap-y-3 ${colIdx === 0 ? 'max-w-[34rem] flex-wrap' : 'flex-wrap'}`}>
        {column.map((group) => (
          <div key={group.title} className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
            <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {group.title}
            </span>
            {group.tiles.map((tile) => {
              const isArmed = payloadMatches(armed, tile.payload);
              const g = tile.geometry;
              const scale = 24;
              return (
                <button
                  key={tile.key}
                  type="button"
                  onPointerDown={(e) => handlePaletteButtonPointerDown(e, tile.payload)}
                  onPointerMove={handlePaletteButtonPointerMove}
                  onPointerUp={handlePaletteButtonPointerUp}
                  onPointerCancel={() => setPaletteDrag(null)}
                  onLostPointerCapture={() => setPaletteDrag(null)}
                  onClick={() => {
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }
                    arm(isArmed ? null : tile.payload);
                  }}
                  aria-pressed={isArmed}
                  aria-label={`${group.title === 'Rechtecke' ? 'Stück' : group.title === 'Dreiecke' ? 'Dreieckpodest' : 'Viertelkreis'} ${tile.label} m ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`.trim()}
                  title={tile.payload.kind === 'viertelkreis' ? 'Viertelkreis, Radius 1 m' : `${tile.label} m`}
                  className={`flex min-w-[3.25rem] cursor-pointer select-none touch-none flex-col items-center gap-1 rounded-md border px-2 py-1.5 ${
                    isArmed
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                      : 'border-[var(--color-panel-stroke)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
                  }`}
                >
                  <span className="flex h-[52px] items-end">
                    <svg
                      width={g.w * scale + 4}
                      height={g.d * scale + 4}
                      viewBox={`-0.08 -0.08 ${g.w + 0.16} ${g.d + 0.16}`}
                      aria-hidden
                    >
                      <PieceShape
                        piece={g}
                        fill={isArmed ? 'rgba(255,255,255,0.35)' : 'var(--color-panel-fill)'}
                        stroke={isArmed ? 'currentColor' : 'var(--color-panel-stroke)'}
                        strokeWidth={0.06}
                      />
                    </svg>
                  </span>
                  <span className="text-[11px] leading-none" style={{ fontFamily: 'var(--font-mono)' }}>
                    {tile.label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        </div>
        ))}
        </div>
      </div>

      <details className="text-xs text-[var(--color-text-muted)]">
        <summary className="cursor-pointer select-none">Tastatur-Kurzbefehle</summary>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Klick</kbd> auf den Plan aktiviert die
            Tastatur
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">↑↓←→</kbd> Auswahl/Cursor um 0,5 m bewegen
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Umschalt</kbd>+
            <kbd className="rounded border border-[var(--color-border)] px-1">↑↓←→</kbd> um 1 m. Ohne Auswahl verschiebt Umschalt+←→ die ganze Fläche
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Enter</kbd> platzieren
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">R</kbd> drehen — auch schon während du
            ein Stück aus der Leiste ziehst, vor dem Loslassen
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Entf</kbd> entfernen
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Esc</kbd> bricht ab (auch während des Ziehens) / wählt ab
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">1</kbd>–
            <kbd className="rounded border border-[var(--color-border)] px-1">4</kbd> Plattengröße (Breite 2 / 1,5 / 1 / 0,5 m, Tiefe 1 m)
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">T</kbd> Dreieckpodest
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Z</kbd> Rückgängig
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+A</kbd> alles auswählen
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+D</kbd> Auswahl duplizieren (rechts daneben)
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Umschalt+Z</kbd> oder
            <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Y</kbd> Wiederholen
          </li>
        </ul>
      </details>
    </div>
  );
}
