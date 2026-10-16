import { useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { LabeledFootPosition } from '../../domain/feet';
import { footColorForHeight } from '../../domain/footColorScale';
import { FOREX_TOP_GAP_MM, type PlacedForexPanel } from '../../domain/forex';
import { trianglePoints } from '../../domain/triangle';
import type { LayoutResult, TriangleCorner } from '../../domain/types';

// Maße angelehnt an LV-/VS-Fuß: Ø48,3-mm-Außenrohr, Innenrohr, Gewindespindel, Stellmutter, Fußplatte.
const FOOT_PLATE_RADIUS_M = 0.075;
const FOOT_PLATE_TOP_RADIUS_M = 0.071;   // leichte Fase an der Oberkante
const FOOT_PLATE_HEIGHT_M = 0.008;
const FOOT_SPINDLE_RADIUS_M = 0.016;     // Gewindespindel
const FOOT_SPINDLE_MAX_M = 0.09;
const FOOT_NUT_RADIUS_M = 0.036;         // Sechskant-Stellmutter
const FOOT_NUT_HEIGHT_M = 0.028;
const FOOT_INNER_RADIUS_M = 0.021;       // Innenrohr
const FOOT_OUTER_RADIUS_M = 0.026;       // Außenrohr (Hülse)
const FOOT_SLEEVE_SHARE = 0.55;          // Anteil der Hülse an der Rohrlänge über der Mutter
const FOOT_BAND_HEIGHT_M = 0.05;         // farbiger Klebering = Höhencode
const FOOT_BAND_RADIUS_M = 0.0268;
const FOOT_BAND_BELOW_DECK_M = 0.04;     // Abstand Ring-Oberkante unter Plattenunterseite
export const PANEL_THICKNESS_M = 0.08;

// Sichtbarer Alu-Strangpress-Rahmen rund um jede Platte (real ca. 4 cm).
const FRAME_WIDTH_M = 0.04;
// Belag liegt 5 mm tiefer als die Rahmen-Oberkante → Rahmen wirkt als erhabene Kante.
const INFILL_RECESS_M = 0.005;
// Gesamtfuge zwischen zwei Nachbarplatten (je 5 mm pro Seite) — wie bisher `p.w - 0.01`.
const PANEL_GAP_M = 0.01;
// Standard-Belag: dunkle Siebdruckplatte mit Sechseck-Prägung.
const DEFAULT_INFILL_COLOR = '#2b2724';
const SONDERMASS_INFILL_COLOR = '#9a6b00';

// Einmal gebaute, geteilte Materialien (nicht pro Mesh neu erzeugen).
const GALVANIZED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#a9aeb1', metalness: 0.85, roughness: 0.45 }); // Rohre, Platte
const SPINDLE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#7f8589', metalness: 0.9, roughness: 0.35 });    // Spindel, Mutter
// Forex-Blende: weiße PVC-Hartschaumplatte (ohne Druckbild).
const FOREX_MATERIAL = new THREE.MeshStandardMaterial({ color: '#f7f7f4', metalness: 0, roughness: 0.7 });
const FOOT_BAND_MATERIALS = new Map<string, THREE.MeshStandardMaterial>();
function footBandMaterial(color: string): THREE.MeshStandardMaterial {
  let m = FOOT_BAND_MATERIALS.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.6 });
    FOOT_BAND_MATERIALS.set(color, m);
  }
  return m;
}

const HEX_TILE_M = 0.25; // eine Texturkachel deckt 25 × 25 cm ab

let hexCanvasCache: HTMLCanvasElement | null | undefined;
/** Einmal gezeichnete Sechseck-Prägung (Graustufen): hell = Plateau, dunkel = Rille. null ohne 2D-Canvas (Tests). */
function hexCanvas(): HTMLCanvasElement | null {
  if (hexCanvasCache !== undefined) return hexCanvasCache;
  hexCanvasCache = null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = 'rgb(236,236,236)';
  ctx.fillRect(0, 0, 256, 256);
  const r = 8;                          // Sechseck-Umkreisradius in px
  const w = Math.sqrt(3) * r;           // Spaltenabstand
  const h = 1.5 * r;                    // Zeilenabstand
  ctx.strokeStyle = 'rgb(185,185,185)';
  ctx.lineWidth = 1.6;
  for (let row = -1; row * h < 256 + r; row++) {
    for (let col = -1; col * w < 256 + w; col++) {
      const cx = col * w + (row % 2 !== 0 ? w / 2 : 0);
      const cy = row * h;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const px = cx + r * 0.82 * Math.cos(a);
        const py = cy + r * 0.82 * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  for (let i = 0; i < 1500; i++) {
    const x = (i * 97) % 256;
    const y = (i * 57 + ((i * i) % 131)) % 256;
    const v = 222 + ((i * 31) % 26);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 1, 1);
  }
  hexCanvasCache = c;
  return c;
}

const INFILL_MATERIALS = new Map<string, THREE.MeshStandardMaterial>();
/**
 * Belag-Material je Farbe + Kachelwiederholung. repeatU/V = Plattenmaß / HEX_TILE_M bei Boxen (UV 0..1),
 * bzw. 1/HEX_TILE_M bei Extrude-Geometrie (UV in Metern).
 */
function infillMaterial(color: string, repeatU: number, repeatV: number): THREE.MeshStandardMaterial {
  const key = `${color}|${repeatU.toFixed(3)}|${repeatV.toFixed(3)}`;
  let m = INFILL_MATERIALS.get(key);
  if (m) return m;
  const canvas = hexCanvas();
  m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
  if (canvas) {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeatU, repeatV);
    map.anisotropy = 8;
    const bump = new THREE.CanvasTexture(canvas);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(repeatU, repeatV);
    bump.anisotropy = 8;
    m.map = map;
    m.bumpMap = bump;
    m.bumpScale = 1.5;
  }
  INFILL_MATERIALS.set(key, m);
  return m;
}

let brushedCanvasCache: HTMLCanvasElement | null | undefined;
/** Feine Längsstreifen (Graustufen) als Roughness-Map: Profil wirkt gebürstet statt plastikglatt. */
function brushedCanvas(): HTMLCanvasElement | null {
  if (brushedCanvasCache !== undefined) return brushedCanvasCache;
  brushedCanvasCache = null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, 512, 64);
  for (let y = 0; y < 64; y++) {
    const v = 100 + ((y * 73 + ((y * y) % 17) * 11) % 60);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 512, 1);
  }
  brushedCanvasCache = c;
  return c;
}

function makeFrameMaterial(rotate: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#cfd0cc', metalness: 0.9, roughness: 0.55 });
  const canvas = brushedCanvas();
  if (canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 4);
    if (rotate) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
    m.roughnessMap = t;
  } else {
    m.roughness = 0.32;
  }
  return m;
}

// Eloxiertes Alu-Strangpressprofil: Streifen laufen in Profil-Längsrichtung.
const FRAME_MATERIAL_X = makeFrameMaterial(false); // Profile entlang X (+ Dreiecke)
const FRAME_MATERIAL_Z = makeFrameMaterial(true);  // Profile entlang Z

/** Versetzt ein konvexes Polygon (u,v) um `t` nach innen (Kanten parallel verschieben, Nachbarn schneiden). */
function insetPolygon(pts: Array<{ x: number; y: number }>, t: number): Array<{ x: number; y: number }> {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    let nx = -dy;
    let ny = dx;
    if (nx * (cx - a.x) + ny * (cy - a.y) < 0) { nx = -nx; ny = -ny; }
    return { px: a.x + nx * t, py: a.y + ny * t, dx, dy };
  });
  return pts.map((_, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const cross = l1.dx * l2.dy - l1.dy * l2.dx;
    const s = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / cross;
    return { x: l1.px + s * l1.dx, y: l1.py + s * l1.dy };
  });
}

function shapeFrom(pts: Array<{ x: number; y: number }>): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
  s.closePath();
  return s;
}

/** Shape-Cache keyed by (kind, corner, w, d) — Rahmen und Belag je Größe/Orientierung.
 *  Kind: 'dreieck' oder 'viertelkreis', corner = Ecke, w/d = Bounding-Box-Maße in Metern.
 *  Format: `${kind}|${corner}|${w.toFixed(3)}|${d.toFixed(3)}` */
const SHAPE_CACHE = new Map<string, { frame: THREE.Shape; infill: THREE.Shape }>();

function getCachedShapes(kind: 'dreieck' | 'viertelkreis', corner: TriangleCorner, w: number, d: number) {
  const key = `${kind}|${corner}|${w.toFixed(3)}|${d.toFixed(3)}`;
  let cached = SHAPE_CACHE.get(key);
  if (cached) return cached;

  let outer: Array<{ x: number; y: number }>;

  if (kind === 'viertelkreis') {
    // Viertelkreis: Mittelpunkt (0,0), Radius = w = d
    // Bogen von (w,0) zu (0,w), dann zurück zu (0,0)
    const radius = w;
    const centerPoints: Record<TriangleCorner, { x: number; y: number }> = {
      tl: { x: 0, y: 0 },
      tr: { x: w, y: 0 },
      bl: { x: 0, y: d },
      br: { x: w, y: d },
    };
    const center = centerPoints[corner];

    // Berechne die beiden Enden des Bogens basierend auf der Ecke
    const points: Record<TriangleCorner, { start: { x: number; y: number }; end: { x: number; y: number } }> = {
      tl: { start: { x: w, y: 0 }, end: { x: 0, y: d } },
      tr: { start: { x: 0, y: 0 }, end: { x: w, y: d } },
      bl: { start: { x: w, y: d }, end: { x: 0, y: 0 } },
      br: { start: { x: 0, y: d }, end: { x: w, y: 0 } },
    };
    const { start, end } = points[corner];

    // Approx. Bogen mit 8 Segmenten. Startet am Mittelpunkt (die Ecke mit dem rechten Winkel),
    // läuft über die erste Radiuskante zum Bogen, entlang des Bogens, und zurück über die zweite
    // Radiuskante — sonst fehlt die Mittelpunkt-Ecke und es entsteht nur eine Sehne/Mondsichel
    // statt eines echten Viertelkreis-Tortenstücks.
    const segments = 8;
    const arc: Array<{ x: number; y: number }> = [center, start];
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    let angle = startAngle;
    const angleDelta = (endAngle - startAngle) / segments;
    for (let i = 1; i <= segments; i++) {
      angle += angleDelta;
      arc.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }
    outer = insetPolygon(arc, PANEL_GAP_M / 2);
  } else {
    // Dreieck: skaliert auf w×d (von 1×1)
    const raw = trianglePoints({ x: 0, y: 0, w, d }, corner).map((pt) => ({ x: pt.x, y: -pt.y }));
    outer = insetPolygon(raw, PANEL_GAP_M / 2);
  }

  const inner = insetPolygon(outer, FRAME_WIDTH_M);
  const frame = shapeFrom(outer);
  const hole = new THREE.Path();
  inner.forEach((p, i) => (i === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y)));
  hole.closePath();
  frame.holes.push(hole);

  const result = { frame, infill: shapeFrom(inner) };
  SHAPE_CACHE.set(key, result);
  return result;
}

/** Ein Fuß: Fußplatte → Gewindespindel → Stellmutter → Innenrohr → Außenhülse mit Höhen-Farbring. */
function Foot({ x, z, baseY, heightM, color }: { x: number; z: number; baseY: number; heightM: number; color: string }) {
  const plateTop = baseY + FOOT_PLATE_HEIGHT_M;
  const deckBottom = baseY + heightM;
  const available = Math.max(deckBottom - plateTop, 0.001);
  const spindleLen = Math.min(FOOT_SPINDLE_MAX_M, available * 0.4);
  const nutBottom = plateTop + spindleLen;
  const tubeStart = nutBottom + FOOT_NUT_HEIGHT_M;
  const tubeLen = deckBottom - tubeStart;
  const hasTubes = tubeLen > 0.02;
  const sleeveLen = hasTubes ? tubeLen * FOOT_SLEEVE_SHARE : 0;
  const innerLen = hasTubes ? tubeLen - sleeveLen : 0;
  const sleeveBottom = deckBottom - sleeveLen;
  const showBand = sleeveLen > FOOT_BAND_HEIGHT_M + FOOT_BAND_BELOW_DECK_M + 0.01;
  return (
    <group>
      <mesh position={[x, baseY + FOOT_PLATE_HEIGHT_M / 2, z]} material={GALVANIZED_MATERIAL} castShadow receiveShadow>
        <cylinderGeometry args={[FOOT_PLATE_TOP_RADIUS_M, FOOT_PLATE_RADIUS_M, FOOT_PLATE_HEIGHT_M, 32]} />
      </mesh>
      <mesh position={[x, plateTop + (hasTubes ? spindleLen : available) / 2, z]} material={SPINDLE_MATERIAL} castShadow>
        <cylinderGeometry args={[FOOT_SPINDLE_RADIUS_M, FOOT_SPINDLE_RADIUS_M, hasTubes ? spindleLen : available, 12]} />
      </mesh>
      {hasTubes && (
        <>
          <mesh position={[x, nutBottom + FOOT_NUT_HEIGHT_M / 2, z]} material={SPINDLE_MATERIAL} castShadow>
            <cylinderGeometry args={[FOOT_NUT_RADIUS_M, FOOT_NUT_RADIUS_M, FOOT_NUT_HEIGHT_M, 6]} />
          </mesh>
          <mesh position={[x, tubeStart + innerLen / 2, z]} material={GALVANIZED_MATERIAL} castShadow>
            <cylinderGeometry args={[FOOT_INNER_RADIUS_M, FOOT_INNER_RADIUS_M, innerLen, 16]} />
          </mesh>
          <mesh position={[x, sleeveBottom + sleeveLen / 2, z]} material={GALVANIZED_MATERIAL} castShadow receiveShadow>
            <cylinderGeometry args={[FOOT_OUTER_RADIUS_M, FOOT_OUTER_RADIUS_M, sleeveLen, 20]} />
          </mesh>
        </>
      )}
      {showBand && (
        <mesh position={[x, deckBottom - FOOT_BAND_BELOW_DECK_M - FOOT_BAND_HEIGHT_M / 2, z]} material={footBandMaterial(color)}>
          <cylinderGeometry args={[FOOT_BAND_RADIUS_M, FOOT_BAND_RADIUS_M, FOOT_BAND_HEIGHT_M, 20]} />
        </mesh>
      )}
    </group>
  );
}

/** Eine Rechteck-Platte: 4 Alu-Rahmenprofile + vertiefter Belag in der Mitte. */
function RectPanel({ cx, cz, deckY, w, d, infillColor }: {
  cx: number; cz: number; deckY: number; w: number; d: number; infillColor: string;
}) {
  const ow = w - PANEL_GAP_M; // Außenmaß inkl. Fuge
  const od = d - PANEL_GAP_M;
  const F = FRAME_WIDTH_M;
  const T = PANEL_THICKNESS_M;
  const yMid = deckY + T / 2;
  const infillH = T - INFILL_RECESS_M;
  return (
    <group>
      {/* vorne / hinten (entlang X, volle Breite) */}
      <mesh position={[cx, yMid, cz - od / 2 + F / 2]} material={FRAME_MATERIAL_X} castShadow receiveShadow>
        <boxGeometry args={[ow, T, F]} />
      </mesh>
      <mesh position={[cx, yMid, cz + od / 2 - F / 2]} material={FRAME_MATERIAL_X} castShadow receiveShadow>
        <boxGeometry args={[ow, T, F]} />
      </mesh>
      {/* links / rechts (entlang Z, zwischen den Längsprofilen) */}
      <mesh position={[cx - ow / 2 + F / 2, yMid, cz]} material={FRAME_MATERIAL_Z} castShadow receiveShadow>
        <boxGeometry args={[F, T, od - 2 * F]} />
      </mesh>
      <mesh position={[cx + ow / 2 - F / 2, yMid, cz]} material={FRAME_MATERIAL_Z} castShadow receiveShadow>
        <boxGeometry args={[F, T, od - 2 * F]} />
      </mesh>
      {/* Belag */}
      <mesh position={[cx, deckY + infillH / 2, cz]} material={infillMaterial(infillColor, (ow - 2 * F) / HEX_TILE_M, (od - 2 * F) / HEX_TILE_M)} castShadow receiveShadow>
        <boxGeometry args={[ow - 2 * F, infillH, od - 2 * F]} />
      </mesh>
    </group>
  );
}

const FOREX_PRINT_TEXTURES = new Map<string, THREE.Texture>();
/** Druck-Textur je Data-URL einmal laden und wiederverwenden. */
function forexPrintTexture(print: string): THREE.Texture {
  let map = FOREX_PRINT_TEXTURES.get(print);
  if (!map) {
    map = new THREE.TextureLoader().load(print);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    FOREX_PRINT_TEXTURES.set(print, map);
  }
  return map;
}

/**
 * Forex-Blende direkt vor einer freien Kante: steht auf dem Boden der Ebene (baseY) und endet
 * 1 cm unter der Belag-Oberkante. Plan-Koordinaten (x, y) → Szene (x, z). Ein Druck liegt auf der
 * Außenseite (lokales +z = Außennormale, wie in der Stadthallenplanung).
 */
function ForexBlende({ forex, print, baseY, belagTopY, offsetX, offsetZ }: {
  forex: PlacedForexPanel; print?: string; baseY: number; belagTopY: number; offsetX: number; offsetZ: number;
}) {
  const { edge, thicknessMm } = forex;
  const t = thicknessMm / 1000;
  const h = belagTopY - FOREX_TOP_GAP_MM / 1000 - baseY;
  const front = useMemo(
    () => (print ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: forexPrintTexture(print), roughness: 0.5 }) : null),
    [print],
  );
  useEffect(() => () => front?.dispose(), [front]);
  if (h <= 0 || edge.lengthM <= 0) return null;
  const cx = (edge.x1 + edge.x2) / 2 + edge.nx * (t / 2) + offsetX;
  const cz = (edge.y1 + edge.y2) / 2 + edge.ny * (t / 2) + offsetZ;
  // Box-Flächen: +x, -x, +y, -y, +z (außen, ggf. bedruckt), -z
  const materials = front
    ? [FOREX_MATERIAL, FOREX_MATERIAL, FOREX_MATERIAL, FOREX_MATERIAL, front, FOREX_MATERIAL]
    : FOREX_MATERIAL;
  return (
    <mesh position={[cx, baseY + h / 2, cz]} rotation={[0, Math.atan2(edge.nx, edge.ny), 0]} material={materials} castShadow receiveShadow>
      <boxGeometry args={[edge.lengthM, h, t]} />
    </mesh>
  );
}

export interface SceneTier {
  layout: LayoutResult;
  /** Füße mit renderX/renderY — wird sichtbar in die Eigentümer-Platte gezeichnet statt exakt auf die Plattengrenze. */
  feet: LabeledFootPosition[];
  /** Höhe dieser Ebene: wie lang die Füße dieser Ebene sind. */
  heightM: number;
  /** Boden-Offset in Metern, auf dem diese Ebene aufsetzt (Standard 0 = Boden). */
  baseY?: number;
  offsetX?: number;
  offsetZ?: number;
  panelColor?: string;
  footColor?: string;
  label?: string;
  /** Forex-Blenden an freien Außenkanten — Kanten in denselben Plan-Koordinaten wie `layout`. */
  forex?: PlacedForexPanel[];
  /** Druckbilder je ForexPanel.id (verkleinerte JPEG-Data-URLs). */
  forexPrints?: Record<string, string>;
}

interface Props {
  tiers: SceneTier[];
  /** Ruft das <canvas>-Element auf, sobald WebGL bereit ist — für den PNG-Export der 3D-Ansicht. */
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

/** Lokale Reflexions-Umgebung (kein CDN, kein Asset) — nötig, damit Alu/Stahl mit hoher Metalness echt wirkt. */
function LocalEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.55;
    room.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      envMap.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Schattenwerfende Sonne, deren Schattenkamera die ganze Szene abdeckt. */
function SunLight({ centerX, centerZ, span, topY }: { centerX: number; centerZ: number; span: number; topY: number }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  const half = span / 2 + 2;
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.target.position.set(centerX, 0, centerZ);
    scene.add(light.target);
    light.target.updateMatrixWorld();
    light.shadow.camera.updateProjectionMatrix();
    return () => { scene.remove(light.target); };
  }, [centerX, centerZ, span, scene]);
  return (
    <directionalLight
      ref={lightRef}
      position={[centerX + span * 0.8, topY + span * 1.5 + 4, centerZ + span * 0.6]}
      intensity={2.2}
      color="#fff6ea"
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
      shadow-radius={3}
      shadow-camera-left={-half}
      shadow-camera-right={half}
      shadow-camera-top={half}
      shadow-camera-bottom={-half}
      shadow-camera-near={0.5}
      shadow-camera-far={span * 4 + 20}
    />
  );
}

/**
 * `<Canvas camera={{position}}>` und `<OrbitControls target={...}>` setzen die Kamera NUR beim
 * ersten Aufbau — sobald OrbitControls übernommen hat, ändert ein späterer Prop-Wechsel (z.B.
 * "Draufsicht" anklicken) nichts mehr an der tatsächlich angezeigten Kamera. Diese unsichtbare
 * Rig-Komponente läuft INNERHALB von <Canvas> (nur dort ist useThree() nutzbar) und setzt
 * Kameraposition + Controls-Ziel bei jeder Änderung (oder Klick auf "Zurücksetzen") aktiv neu.
 */
function CameraRig({
  cameraX,
  cameraY,
  cameraZ,
  targetX,
  targetY,
  targetZ,
  resetToken,
  controlsRef,
}: {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  resetToken: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(cameraX, cameraY, cameraZ);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(targetX, targetY, targetZ);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraX, cameraY, cameraZ, targetX, targetY, targetZ, resetToken]);
  return null;
}

export function AufbauScene3D({ tiers, onCanvasReady }: Props) {
  const [topView, setTopView] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const validTiers = tiers.filter((t) => t.layout.widthM > 0 && t.layout.depthM > 0);
  if (validTiers.length === 0) return null;

  const maxX = Math.max(...validTiers.map((t) => (t.offsetX ?? 0) + t.layout.widthM));
  const maxZ = Math.max(...validTiers.map((t) => (t.offsetZ ?? 0) + t.layout.depthM));
  const maxTopY = Math.max(...validTiers.map((t) => (t.baseY ?? 0) + t.heightM));
  const centerX = maxX / 2;
  const centerZ = maxZ / 2;
  const camDistance = Math.max(maxX, maxZ, 2) * 1.4;
  const span = Math.max(maxX, maxZ, 2);

  const cameraPosition: [number, number, number] = topView
    ? [centerX, maxTopY + camDistance * 1.6, centerZ + 0.01]
    : [centerX + camDistance * 0.6, maxTopY + camDistance * 0.7, centerZ + camDistance];
  const targetPosition: [number, number, number] = [centerX, maxTopY / 2, centerZ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setTopView(false)}
          aria-pressed={!topView}
          className={`px-3 py-1.5 rounded-md text-sm border ${!topView ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'}`}
        >
          Perspektive
        </button>
        <button
          type="button"
          onClick={() => setTopView(true)}
          aria-pressed={topView}
          className={`px-3 py-1.5 rounded-md text-sm border ${topView ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'}`}
        >
          Draufsicht
        </button>
        <button
          type="button"
          onClick={() => setResetToken((t) => t + 1)}
          title="Kamera wieder auf die aktuelle Ansicht (Perspektive/Draufsicht) zurücksetzen — hilft, wenn man sich verzoomt/verdreht hat"
          className="px-3 py-1.5 rounded-md text-sm border bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]"
        >
          ↺ Zurücksetzen
        </button>
      </div>
      <div className="w-full h-[420px] rounded-lg overflow-hidden border border-[var(--color-border)]">
        <Canvas
          shadows="percentage"
          camera={{ position: cameraPosition, fov: 40 }}
          gl={{ preserveDrawingBuffer: true }}
          onCreated={(state) => onCanvasReady?.(state.gl.domElement)}
        >
          <LocalEnvironment />
          <hemisphereLight args={['#ffffff', '#cfc8ba', 0.35]} />
          <SunLight centerX={centerX} centerZ={centerZ} span={span} topY={maxTopY} />
          <directionalLight position={[-5, 6, -5]} intensity={0.35} color="#e8eef5" />

          <mesh position={[centerX, -0.001, centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[maxX + 6, maxZ + 6]} />
            <meshStandardMaterial color="#d8d5ce" roughness={0.95} metalness={0} />
          </mesh>

          {validTiers.map((tier, tierIndex) => {
            const offsetX = tier.offsetX ?? 0;
            const offsetZ = tier.offsetZ ?? 0;
            const baseY = tier.baseY ?? 0;
            const deckY = baseY + tier.heightM;
            return (
              <group key={tierIndex}>
                {tier.layout.panels.map((p, i) =>
                  p.corner === undefined ? (
                    <RectPanel
                      key={i}
                      cx={p.x + offsetX + p.w / 2}
                      cz={p.y + offsetZ + p.d / 2}
                      deckY={deckY}
                      w={p.w}
                      d={p.d}
                      infillColor={p.isSondermass ? SONDERMASS_INFILL_COLOR : (tier.panelColor ?? DEFAULT_INFILL_COLOR)}
                    />
                  ) : (() => {
                    const kind = p.shape === 'viertelkreis' ? 'viertelkreis' : 'dreieck';
                    const shapes = getCachedShapes(kind, p.corner, p.w, p.d);
                    return (
                      <group key={i} position={[p.x + offsetX, deckY, p.y + offsetZ]} rotation={[-Math.PI / 2, 0, 0]}>
                        <mesh material={FRAME_MATERIAL_X} castShadow receiveShadow>
                          <extrudeGeometry args={[shapes.frame, { depth: PANEL_THICKNESS_M, bevelEnabled: false }]} />
                        </mesh>
                        <mesh material={infillMaterial(tier.panelColor ?? DEFAULT_INFILL_COLOR, 1 / HEX_TILE_M, 1 / HEX_TILE_M)} castShadow receiveShadow>
                          <extrudeGeometry args={[shapes.infill, { depth: PANEL_THICKNESS_M - INFILL_RECESS_M, bevelEnabled: false }]} />
                        </mesh>
                      </group>
                    );
                  })(),
                )}

                {tier.forex?.map((fx) => (
                  <ForexBlende
                    key={fx.panel.id}
                    forex={fx}
                    print={tier.forexPrints?.[fx.panel.id]}
                    baseY={baseY}
                    belagTopY={deckY + PANEL_THICKNESS_M - INFILL_RECESS_M}
                    offsetX={offsetX}
                    offsetZ={offsetZ}
                  />
                ))}

                {tier.feet.map((f, i) => (
                  <Foot
                    key={i}
                    x={f.renderX + offsetX}
                    z={f.renderY + offsetZ}
                    baseY={baseY}
                    heightM={tier.heightM}
                    color={tier.footColor ?? footColorForHeight(tier.heightM * 100)}
                  />
                ))}
              </group>
            );
          })}

          <OrbitControls
            ref={controlsRef}
            target={targetPosition}
            minDistance={0.5}
            maxDistance={camDistance * 6}
          />
          <CameraRig
            cameraX={cameraPosition[0]}
            cameraY={cameraPosition[1]}
            cameraZ={cameraPosition[2]}
            targetX={targetPosition[0]}
            targetY={targetPosition[1]}
            targetZ={targetPosition[2]}
            resetToken={resetToken}
            controlsRef={controlsRef}
          />
        </Canvas>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Der farbige Ring am Fußrohr zeigt die Fußhöhe (siehe Legende). Verzoomt/verdreht? "↺ Zurücksetzen" bringt die Kamera zurück.
      </p>
    </div>
  );
}
