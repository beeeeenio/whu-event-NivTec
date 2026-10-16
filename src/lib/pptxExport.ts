import PptxGenJS from 'pptxgenjs';
import { measureLength, SYMBOL_LABELS, type PlanAnnotation } from '../domain/annotations';
import { boundingBoxOf } from '../domain/customShape';
import { dimensionChains, type DimSegment } from '../domain/dimensions';
import type { LabeledFootPosition } from '../domain/feet';
import { footColorForHeight } from '../domain/footColorScale';
import type { LayoutResult, MaterialListItem, TriangleCorner } from '../domain/types';
import { CI_PPTX_LOGOS, type CiId } from './ci';
import { materialListRows } from './csv';
import { formatMeters } from './format';

/**
 * PowerPoints eingebautes "rtTriangle"-Autoshape hat bei rot=0° den rechten Winkel laut
 * DrawingML-Preset-Geometrie unten-links (bl) — Rotation ist in PowerPoint (wie in diesem Tool)
 * im Uhrzeigersinn positiv, daher rückt der rechte Winkel je 90° eine Ecke im Uhrzeigersinn
 * weiter (bl→tl→tr→br). Nicht mit Rendern verifiziert (nur die erzeugte XML-Struktur per
 * Bash/unzip) — falls die Ecke im echten PowerPoint doch nicht stimmt, hier korrigieren.
 */
const TRIANGLE_ROTATION_DEG: Record<TriangleCorner, number> = { bl: 0, tl: 90, tr: 180, br: 270 };

const SLIDE_WIDTH_IN = 13.33;
const SLIDE_HEIGHT_IN = 7.5;
const MARGIN_IN = 0.6;
const TITLE_H_IN = 0.5;
const SECTION_LABEL_H_IN = 0.3;
const SECTION_GAP_IN = 0.4;

const PANEL_FILL = '2C3E6B';
const PANEL_SONDERMASS_FILL = '9A6B00';
const PANEL_LINE = '061638';

/** Platz am Rand der Fläche für die Maßketten (rechts und unten), in Zoll. */
const DIM_PAD_IN = 0.6;
/** Abstand der Segment- bzw. Außenmaßreihe zur Fläche, in Zoll. */
const DIM_ROW_SEGMENT_IN = 0.15;
const DIM_ROW_OUTER_IN = 0.35;
/** Größe der Maßzahl-Box (Zoll); die Box sitzt mittig auf der Maßlinie. */
const DIM_TEXT_W_IN = 0.6;
const DIM_TEXT_H_IN = 0.2;

/** Notausgang-Symbol: Grün, wie im Editor (EXIT_COLOR). */
const EXIT_COLOR = '2E7D32';
/** Maße eines Symbols in Metern, wie im Editor (AnnotationLayer). */
const SYMBOL_W_M = 0.9;
const SYMBOL_H_M = 0.45;

function toHex(color: string): string {
  return color.replace('#', '').toUpperCase();
}

export interface PptxSection {
  layout: LayoutResult;
  feet: LabeledFootPosition[];
  heightCm: number;
  /** Beschriftung über diesem Abschnitt, z.B. "Unterbau" / "Thekenplatte (oben)". */
  label: string;
  /** Maßketten (Außen- und Segmentmaße) unter bzw. rechts neben der Fläche. */
  showDimensions?: boolean;
  /** Notizen, Symbole und Messlinien; Koordinaten im selben System wie die Stücke (Meter). */
  annotations?: PlanAnnotation[];
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Maßketten um die Fläche: Segmentreihe (nur bei mehr als einem Segment) und Außenmaß, je Achse.
 *  Die Maßzahl sitzt mittig auf ihrer Linie und hat einen weißen Hintergrund, damit die Linie unterbrochen wirkt. */
function drawDimensionChains(
  slide: PptxGenJS.Slide,
  rects: readonly { x: number; y: number; w: number; d: number }[],
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  const chains = dimensionChains(rects);
  if (!chains) return;

  const xAt = (m: number) => offsetX + m * scale;
  const yAt = (m: number) => offsetY + m * scale;
  const lineProps = { color: PANEL_LINE, width: 0.75 };
  const textProps = { fontSize: 8, color: PANEL_LINE, fontFace: 'Arial', align: 'center' as const, valign: 'middle' as const, fill: { color: 'FFFFFF' } };

  // x-Kette unter der Fläche (Maßlinien waagerecht).
  const bottom = yAt(chains.y.outer.to);
  const drawHorizontal = (seg: DimSegment, rowIn: number) => {
    const y = bottom + rowIn;
    const x1 = xAt(seg.from);
    const x2 = xAt(seg.to);
    slide.addShape('line', { x: x1, y, w: x2 - x1, h: 0, line: lineProps });
    slide.addText(formatMeters(seg.lengthM, 2), {
      ...textProps,
      x: (x1 + x2) / 2 - DIM_TEXT_W_IN / 2,
      y: y - DIM_TEXT_H_IN / 2,
      w: DIM_TEXT_W_IN,
      h: DIM_TEXT_H_IN,
    });
  };
  if (chains.x.segments.length > 1) chains.x.segments.forEach((s) => drawHorizontal(s, DIM_ROW_SEGMENT_IN));
  drawHorizontal(chains.x.outer, DIM_ROW_OUTER_IN);

  // y-Kette rechts der Fläche (Maßlinien senkrecht, Text um 270° gedreht).
  const right = xAt(chains.x.outer.to);
  const drawVertical = (seg: DimSegment, colIn: number) => {
    const x = right + colIn;
    const y1 = yAt(seg.from);
    const y2 = yAt(seg.to);
    const cy = (y1 + y2) / 2;
    slide.addShape('line', { x, y: y1, w: 0, h: y2 - y1, line: lineProps });
    slide.addText(formatMeters(seg.lengthM, 2), {
      ...textProps,
      x: x - DIM_TEXT_W_IN / 2,
      y: cy - DIM_TEXT_H_IN / 2,
      w: DIM_TEXT_W_IN,
      h: DIM_TEXT_H_IN,
      rotate: 270,
    });
  };
  if (chains.y.segments.length > 1) chains.y.segments.forEach((s) => drawVertical(s, DIM_ROW_SEGMENT_IN));
  drawVertical(chains.y.outer, DIM_ROW_OUTER_IN);
}

/** Notizen, Symbole und Messlinien an denselben Koordinaten wie im Editor (Meter, Ursprung oben links). */
function drawAnnotations(
  slide: PptxGenJS.Slide,
  annotations: readonly PlanAnnotation[],
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  const xAt = (m: number) => offsetX + m * scale;
  const yAt = (m: number) => offsetY + m * scale;

  for (const a of annotations) {
    if (a.kind === 'text') {
      slide.addText(a.text, {
        x: xAt(a.x),
        y: yAt(a.y),
        w: Math.max(0.8, a.text.length * 0.09),
        h: 0.25,
        fontSize: 9,
        color: PANEL_LINE,
        fontFace: 'Arial',
        valign: 'top',
        margin: 0,
      });
      continue;
    }

    if (a.kind === 'symbol') {
      const frame = a.symbol === 'notausgang' ? EXIT_COLOR : PANEL_LINE;
      const x = xAt(a.x);
      const y = yAt(a.y);
      const w = SYMBOL_W_M * scale;
      const h = SYMBOL_H_M * scale;
      slide.addShape('roundRect', { x, y, w, h, fill: { color: 'FFFFFF' }, line: { color: frame, width: 1.5 } });
      slide.addText(SYMBOL_LABELS[a.symbol], {
        x,
        y,
        w,
        h,
        fontSize: 9,
        color: frame,
        fontFace: 'Arial',
        align: 'center',
        valign: 'middle',
      });
      continue;
    }

    // Messlinie: Bounding-Box der Linie, bei entgegengesetzter Richtung gespiegelt; Länge am Mittelpunkt.
    const x1 = xAt(a.x1);
    const y1 = yAt(a.y1);
    const x2 = xAt(a.x2);
    const y2 = yAt(a.y2);
    slide.addShape('line', {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
      flipH: x2 < x1,
      flipV: y2 < y1,
      line: { color: PANEL_LINE, width: 1.25 },
    });
    slide.addText(`${formatMeters(measureLength(a))} m`, {
      x: (x1 + x2) / 2 - 0.4,
      y: (y1 + y2) / 2 - 0.3,
      w: 0.8,
      h: 0.2,
      fontSize: 9,
      color: PANEL_LINE,
      fontFace: 'Arial',
      align: 'center',
      valign: 'middle',
      fill: { color: 'FFFFFF' },
    });
  }
}

/** Zeichnet einen Grundriss (Platten als Rechteck-Shapes, Füße als Kreis-Shapes) skaliert in einen
 *  Bereich der Folie — eng um die tatsächlich belegte Fläche, nicht ab dem Ursprung gemessen (sonst
 *  würden Maße und Leerraum schon von der bloßen Lage auf der Zeichenfläche abhängen). */
function drawSection(slide: PptxGenJS.Slide, section: PptxSection, region: Region): void {
  const { layout, feet, heightCm, label, showDimensions = false, annotations = [] } = section;
  const box = boundingBoxOf(layout.panels);
  if (!box || box.widthM <= 0 || box.depthM <= 0) return;

  const dims = `${formatMeters(box.widthM)} × ${formatMeters(box.depthM)} m, BH ${heightCm} cm`;
  slide.addText(label ? `${label} — ${dims}` : dims, {
    x: region.x,
    y: region.y,
    w: region.w,
    h: SECTION_LABEL_H_IN,
    fontSize: 12,
    bold: true,
    color: '061638',
    fontFace: 'Arial',
  });

  // Mit Maßketten bleibt rechts und unten Platz für die Maßreihen; ohne sie ist die Zeichenfläche wie zuvor.
  const dimPad = showDimensions ? DIM_PAD_IN : 0;
  const drawableY = region.y + SECTION_LABEL_H_IN;
  const drawableW = region.w - dimPad;
  const drawableH = region.h - SECTION_LABEL_H_IN - dimPad;
  const scale = Math.min(drawableW / box.widthM, drawableH / box.depthM);
  const drawnW = box.widthM * scale;
  const drawnH = box.depthM * scale;
  const offsetX = region.x + (drawableW - drawnW) / 2 - box.x * scale;
  const offsetY = drawableY + (drawableH - drawnH) / 2 - box.y * scale;

  for (const p of layout.panels) {
    if (p.corner !== undefined && p.shape === 'viertelkreis') {
      // Quarter-circle: export as rectangle (limitation of PPTX shapes;
      // 2D and 3D views show the correct curved shape)
      slide.addShape('rect', {
        x: offsetX + p.x * scale,
        y: offsetY + p.y * scale,
        w: p.w * scale,
        h: p.d * scale,
        fill: { color: PANEL_FILL },
        line: { color: PANEL_LINE, width: 1 },
      });
      continue;
    }
    if (p.corner !== undefined) {
      slide.addShape('rtTriangle', {
        x: offsetX + p.x * scale,
        y: offsetY + p.y * scale,
        w: p.w * scale,
        h: p.d * scale,
        rotate: TRIANGLE_ROTATION_DEG[p.corner],
        fill: { color: PANEL_FILL },
        line: { color: PANEL_LINE, width: 1 },
      });
      continue;
    }
    slide.addShape('rect', {
      x: offsetX + p.x * scale,
      y: offsetY + p.y * scale,
      w: p.w * scale,
      h: p.d * scale,
      fill: { color: p.isSondermass ? PANEL_SONDERMASS_FILL : PANEL_FILL },
      line: { color: PANEL_LINE, width: 1 },
    });
  }

  const footColor = toHex(footColorForHeight(heightCm));
  const footDiameterIn = Math.max(0.07, Math.min(0.3, 0.16 * scale));
  for (const f of feet) {
    slide.addShape('ellipse', {
      x: offsetX + f.renderX * scale - footDiameterIn / 2,
      y: offsetY + f.renderY * scale - footDiameterIn / 2,
      w: footDiameterIn,
      h: footDiameterIn,
      fill: { color: footColor },
      line: { color: '000000', width: 0.5 },
    });
  }

  if (showDimensions) drawDimensionChains(slide, layout.panels, offsetX, offsetY, scale);
  if (annotations.length > 0) drawAnnotations(slide, annotations, offsetX, offsetY, scale);
}

function newSlide(pptx: PptxGenJS): PptxGenJS.Slide {
  pptx.defineLayout({ name: 'NIVTEC_WIDE', width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = 'NIVTEC_WIDE';
  return pptx.addSlide();
}

function addMainTitle(slide: PptxGenJS.Slide, title: string, availableW: number): void {
  slide.addText(title, {
    x: MARGIN_IN,
    y: 0.2,
    w: availableW,
    h: TITLE_H_IN,
    fontSize: 16,
    bold: true,
    color: '061638',
    fontFace: 'Arial',
  });
}

/**
 * Platziert das Logo der aktuell aktiven CI oben rechts auf der Folie — dieselbe Initiative, die
 * gerade im Tool ausgewählt ist.
 */
function addCiLogo(slide: PptxGenJS.Slide, ci: CiId): void {
  const logo = CI_PPTX_LOGOS[ci];
  const heightIn = 0.4;
  const widthIn = heightIn * logo.aspectRatio;
  const x = SLIDE_WIDTH_IN - MARGIN_IN - widthIn;
  const y = 0.15;

  slide.addImage({ path: logo.imagePath, x, y, w: widthIn, h: heightIn });
}

/**
 * Folie mit der Materialliste als bearbeitbare PowerPoint-Tabelle (inkl. Art.-Nr.-Spalte); lange
 * Listen laufen über weitere Folien (autoPage). Fehlende Artikelnummern stehen als '–'.
 */
function addMaterialSlide(pptx: PptxGenJS, items: MaterialListItem[], title: string): void {
  const slide = pptx.addSlide();
  const availableW = SLIDE_WIDTH_IN - MARGIN_IN * 2;
  addMainTitle(slide, title, availableW);

  const [header, ...body] = materialListRows(items);
  const rows = [
    header.map((text) => ({ text, options: { bold: true } })),
    ...body.map((r) => r.map((text) => ({ text }))),
  ];
  slide.addTable(rows, {
    x: MARGIN_IN,
    y: MARGIN_IN + TITLE_H_IN,
    w: availableW,
    fontSize: 9,
    fontFace: 'Arial',
    border: { type: 'solid', color: 'BBBBBB', pt: 0.5 },
    autoPage: true,
  });
}

/**
 * Exportiert einen einzelnen Grundriss als editierbare PowerPoint-Folie: jede Platte
 * ist ein eigenes Rechteck-Shape, jeder Fuß ein eigenes Kreis-Shape (Farbe nach
 * Fußhöhe, siehe footColorScale) — beides in PowerPoint frei verschiebbar/anpassbar.
 * `extras` schaltet Maßketten zu und legt Notizen, Symbole und Messlinien auf die Folie.
 * Ist `materialList` nicht leer, folgt eine zweite Folie „Materialliste“.
 */
export async function exportLayoutAsPptx(
  layout: LayoutResult,
  feet: LabeledFootPosition[],
  heightCm: number,
  filename: string,
  ci: CiId,
  title = 'Grundrissplan',
  extras?: { showDimensions?: boolean; annotations?: PlanAnnotation[] },
  materialList?: MaterialListItem[],
): Promise<void> {
  const pptx = new PptxGenJS();
  const slide = newSlide(pptx);
  const availableW = SLIDE_WIDTH_IN - MARGIN_IN * 2;
  const availableH = SLIDE_HEIGHT_IN - MARGIN_IN * 2 - TITLE_H_IN;

  addMainTitle(slide, title, availableW);
  addCiLogo(slide, ci);
  drawSection(
    slide,
    { layout, feet, heightCm, label: '', showDimensions: extras?.showDimensions, annotations: extras?.annotations },
    { x: MARGIN_IN, y: MARGIN_IN + TITLE_H_IN, w: availableW, h: availableH },
  );

  if (materialList && materialList.length > 0) addMaterialSlide(pptx, materialList, 'Materialliste');
  await pptx.writeFile({ fileName: filename });
}

/**
 * Exportiert mehrere Grundriss-Abschnitte nebeneinander auf einer Folie (z.B.
 * Tresen-Unterbau + Thekenplatte) — genau wie die 2D-Ansicht im Tool sie
 * nebeneinander zeigt.
 */
export async function exportSectionsAsPptx(
  sections: PptxSection[],
  filename: string,
  ci: CiId,
  title: string,
  materialList?: MaterialListItem[],
): Promise<void> {
  const pptx = new PptxGenJS();
  const slide = newSlide(pptx);
  const availableW = SLIDE_WIDTH_IN - MARGIN_IN * 2;
  const availableH = SLIDE_HEIGHT_IN - MARGIN_IN * 2 - TITLE_H_IN;

  addMainTitle(slide, title, availableW);
  addCiLogo(slide, ci);

  const count = Math.max(1, sections.length);
  const sectionW = (availableW - SECTION_GAP_IN * (count - 1)) / count;

  sections.forEach((section, i) => {
    const x = MARGIN_IN + i * (sectionW + SECTION_GAP_IN);
    drawSection(slide, section, { x, y: MARGIN_IN + TITLE_H_IN, w: sectionW, h: availableH });
  });

  if (materialList && materialList.length > 0) addMaterialSlide(pptx, materialList, 'Materialliste');
  await pptx.writeFile({ fileName: filename });
}
