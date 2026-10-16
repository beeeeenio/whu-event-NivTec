import { measureLength, SYMBOL_LABELS, type PlanAnnotation } from '../domain/annotations';
import { boundingBoxOf } from '../domain/customShape';
import { dimensionChains, type DimSegment } from '../domain/dimensions';
import type { LabeledFootPosition } from '../domain/feet';
import { footColorForHeight } from '../domain/footColorScale';
import { quarterCirclePath, trianglePoints } from '../domain/triangle';
import type { LayoutResult, PanelInstance } from '../domain/types';
import { formatMeters } from './format';

/**
 * Maßstäblicher Plan als SVG-Text (1:50 oder 1:100, A4 oder A3, quer oder hoch).
 * Reiner String-Aufbau ohne DOM und ohne Abhängigkeiten, damit er in vitest (node) testbar ist.
 * Alle Maße des SVG sind Millimeter auf dem Papier; die Platten liegen in echtem Maßstab
 * (1 m = 20 mm bei 1:50, 10 mm bei 1:100). Keine CSS-Variablen, damit die Datei eigenständig bleibt.
 */

export type PaperFormat = 'A4' | 'A3';
export type PaperOrientation = 'quer' | 'hoch';
export type PlanScale = 50 | 100;

export interface ScaledPlanSection {
  /** Beschriftung über diesem Abschnitt, z.B. "Unterbau" / "Thekenplatte (oben)". */
  label: string;
  layout: LayoutResult;
  feet: LabeledFootPosition[];
  heightCm: number;
  /** Maßketten (Außen- und Segmentmaße) rechts bzw. unter der Fläche. */
  showDimensions?: boolean;
  /** Notizen, Symbole und Messlinien; Koordinaten im selben System wie die Stücke (Meter). */
  annotations?: PlanAnnotation[];
}

export interface ScaledPlanOptions {
  title: string;
  dateText: string;
  scale: PlanScale;
  paper: PaperFormat;
  orientation: PaperOrientation;
  sections: ScaledPlanSection[];
  organisation?: string;
}

const PAPER_MM: Record<PaperFormat, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
};

/** Rand rundherum auf dem Papier, in mm. */
export const PLAN_MARGIN_MM = 10;
/** Plankopf unten rechts, in mm. */
export const TITLE_BLOCK_MM = { w: 90, h: 28 };

/** Streifen unten für Maßstabsleiste, Legende und Plankopf, in mm. */
const STRIP_MM = 32;
/** Platz über jedem Abschnitt für die Publikumsseite, in mm. */
const AUDIENCE_MM = 12;
/** Abstand zwischen nebeneinander liegenden Abschnitten, in mm. */
const SECTION_GAP_MM = 15;
/** Zusätzlicher Platz rechts und unten, wenn Maßketten gezeichnet werden, in mm. */
const DIM_EXTRA_MM = 10;
/** Abstand der Segment- bzw. Außenmaßreihe zur Fläche, in mm. */
const DIM_ROW_SEGMENT_MM = 3;
const DIM_ROW_OUTER_MM = 7;

const PANEL_FILL = '#e8ecf5';
const PANEL_SONDERMASS_FILL = '#f3e3bf';
const PANEL_STROKE = '#061638';
/** Notausgang-Symbol: Grün, wie im Editor und in der PPTX. */
const EXIT_COLOR = '#2E7D32';
/** Maße eines Symbols in Metern, wie im Editor und in der PPTX. */
const SYMBOL_W_M = 0.9;
const SYMBOL_H_M = 0.45;
/** Radius eines Fußes auf dem Papier, in mm. */
const FOOT_RADIUS_MM = 1.2;
/** Höhe der Maßstabsleiste, in mm. */
const SCALEBAR_H_MM = 2.5;
/** Maßstabsleiste: 2 m in vier Feldern zu 0,5 m. */
const SCALEBAR_FIELDS = 4;
/** Abstand zwischen den Einträgen der Fußfarben-Legende, in mm. */
const LEGEND_ITEM_MM = 20;
const LEGEND_ROW_MM = 6.5;
const FONT_FAMILY = 'Arial, sans-serif';

/** Papiermaße in mm; 'hoch' tauscht Breite und Höhe. */
export function paperSizeMm(f: PaperFormat, o: PaperOrientation): { w: number; h: number } {
  const base = PAPER_MM[f];
  return o === 'quer' ? { w: base.w, h: base.h } : { w: base.h, h: base.w };
}

/** Millimeter auf dem Papier je Meter Plan: 1:50 → 20 mm, 1:100 → 10 mm. */
export function mmPerMeter(scale: PlanScale): number {
  return 1000 / scale;
}

/** Zahl für SVG-Attribute, auf 4 Nachkommastellen gerundet. */
function num(v: number): string {
  return String(Math.round(v * 10000) / 10000);
}

/** Maskiert die Zeichen, die in SVG-Text und Attributen als Markup gelten. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Ein <text>-Element in mm-Koordinaten des Papiers. */
function textEl(
  x: number,
  y: number,
  content: string,
  opts: { size: number; anchor?: 'start' | 'middle'; bold?: boolean; fill?: string },
): string {
  const anchor = opts.anchor && opts.anchor !== 'start' ? ` text-anchor="${opts.anchor}"` : '';
  const weight = opts.bold ? ' font-weight="bold"' : '';
  return `<text x="${num(x)}" y="${num(y)}" font-size="${num(opts.size)}"${anchor}${weight} fill="${opts.fill ?? PANEL_STROKE}">${escapeXml(content)}</text>`;
}

/** Beschriftung mit weißem Hintergrund, die eine Maßlinie unterbricht. Mittelpunkt (cx, cy) in mm. */
function labelBox(cx: number, cy: number, content: string, size: number): string {
  const w = content.length * size * 0.65 + 1.2;
  const h = size * 1.3;
  const rect = `<rect x="${num(cx - w / 2)}" y="${num(cy - h / 2)}" width="${num(w)}" height="${num(h)}" fill="#ffffff"/>`;
  return rect + textEl(cx, cy + size * 0.35, content, { size, anchor: 'middle' });
}

/** Abschnittsgröße auf dem Papier in mm: Fläche in echtem Maßstab plus Beschriftung und Maßketten. */
function sectionSizeMm(s: ScaledPlanSection, scale: PlanScale): { w: number; h: number } {
  const box = boundingBoxOf(s.layout.panels);
  if (!box) return { w: 0, h: AUDIENCE_MM };
  const k = mmPerMeter(scale);
  const extra = s.showDimensions ? DIM_EXTRA_MM : 0;
  return { w: box.widthM * k + extra, h: AUDIENCE_MM + box.depthM * k + extra };
}

/**
 * Passt der Plan aufs Papier? Abschnitte nebeneinander (mit Abstand) dürfen die Breite zwischen
 * den Rändern nicht überschreiten, der höchste Abschnitt muss über dem Streifen unten Platz haben.
 */
export function planFitsOnPaper(o: ScaledPlanOptions): boolean {
  const { w, h } = paperSizeMm(o.paper, o.orientation);
  const sizes = o.sections.map((s) => sectionSizeMm(s, o.scale));
  const totalW = sizes.reduce((sum, s) => sum + s.w, 0) + SECTION_GAP_MM * Math.max(0, sizes.length - 1);
  const maxH = Math.max(0, ...sizes.map((s) => s.h));
  const EPS = 1e-6;
  return totalW <= w - 2 * PLAN_MARGIN_MM + EPS && maxH <= h - 2 * PLAN_MARGIN_MM - STRIP_MM + EPS;
}

/** Ein Stück in Plan-Metern als SVG-Element; die Umrechnung übernimmt die umgebende Gruppe. */
function panelSvg(p: PanelInstance): string {
  const fill = p.isSondermass ? PANEL_SONDERMASS_FILL : PANEL_FILL;
  const style = `fill="${fill}" stroke="${PANEL_STROKE}" stroke-width="0.25" vector-effect="non-scaling-stroke"`;
  if (p.corner !== undefined && p.shape === 'viertelkreis') {
    return `<path d="${quarterCirclePath(p, p.corner)}" ${style}/>`;
  }
  if (p.corner !== undefined) {
    const pts = trianglePoints(p, p.corner)
      .map((pt) => `${num(pt.x)},${num(pt.y)}`)
      .join(' ');
    return `<polygon points="${pts}" ${style}/>`;
  }
  return `<rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.d)}" ${style}/>`;
}

/**
 * Ein Abschnitt: Beschriftung, Publikumsseite mit Pfeil auf die Vorderkante (y=0, Oberkante der
 * Fläche), Platten und Füße in echtem Maßstab, Maßketten und Notizen. x0/y0 ist die linke obere
 * Ecke des Abschnitts auf dem Papier (mm).
 */
function sectionSvg(s: ScaledPlanSection, x0: number, y0: number, k: number): string[] {
  const out: string[] = [];
  out.push(textEl(x0, y0 + 3.5, `${s.label} – BH ${s.heightCm} cm`, { size: 3.5, bold: true }));

  const box = boundingBoxOf(s.layout.panels);
  if (!box) return out;

  // Bounding-Box beginnt bei x0 und liegt unter der Publikumsseite; Plan-Koordinaten werden so verschoben.
  const planTop = y0 + AUDIENCE_MM;
  const ox = x0 - box.x * k;
  const oy = planTop - box.y * k;
  const planRight = x0 + box.widthM * k;
  const planBottom = planTop + box.depthM * k;
  const cx = x0 + (box.widthM * k) / 2;

  // Publikumsseite: Beschriftung und Pfeil von oben auf die Vorderkante.
  out.push(textEl(cx, y0 + 7, 'PUBLIKUM', { size: 2.8, anchor: 'middle', bold: true }));
  out.push(`<line x1="${num(cx)}" y1="${num(y0 + 7.8)}" x2="${num(cx)}" y2="${num(planTop - 2.2)}" stroke="${PANEL_STROKE}" stroke-width="0.35"/>`);
  out.push(
    `<polygon points="${num(cx)},${num(planTop - 0.3)} ${num(cx - 1.2)},${num(planTop - 2.4)} ${num(cx + 1.2)},${num(planTop - 2.4)}" fill="${PANEL_STROKE}"/>`,
  );

  // Platten und Füße: Plan-Meter in einer Gruppe, die auf mm skaliert.
  out.push(`<g transform="translate(${num(ox)} ${num(oy)}) scale(${num(k)})">`);
  for (const p of s.layout.panels) out.push(panelSvg(p));
  const footColor = footColorForHeight(s.heightCm);
  for (const f of s.feet) {
    out.push(
      `<circle cx="${num(f.renderX)}" cy="${num(f.renderY)}" r="${num(FOOT_RADIUS_MM / k)}" fill="${footColor}" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`,
    );
  }
  out.push('</g>');

  // Maßketten: Segmentreihe (nur bei mehr als einem Segment) und Außenmaß, je Achse.
  if (s.showDimensions) {
    const chains = dimensionChains(s.layout.panels);
    if (chains) {
      const hLine = (seg: DimSegment, rowMm: number) => {
        const y = planBottom + rowMm;
        const xa = ox + seg.from * k;
        const xb = ox + seg.to * k;
        out.push(`<line x1="${num(xa)}" y1="${num(y)}" x2="${num(xb)}" y2="${num(y)}" stroke="${PANEL_STROKE}" stroke-width="0.25"/>`);
        out.push(labelBox((xa + xb) / 2, y, formatMeters(seg.lengthM, 2), 2.5));
      };
      if (chains.x.segments.length > 1) chains.x.segments.forEach((seg) => hLine(seg, DIM_ROW_SEGMENT_MM));
      hLine(chains.x.outer, DIM_ROW_OUTER_MM);

      const vLine = (seg: DimSegment, colMm: number) => {
        const x = planRight + colMm;
        const ya = oy + seg.from * k;
        const yb = oy + seg.to * k;
        const cy = (ya + yb) / 2;
        out.push(`<line x1="${num(x)}" y1="${num(ya)}" x2="${num(x)}" y2="${num(yb)}" stroke="${PANEL_STROKE}" stroke-width="0.25"/>`);
        // Maßzahl um 270° gedreht, wie in der PPTX.
        out.push(`<g transform="rotate(-90 ${num(x)} ${num(cy)})">${labelBox(x, cy, formatMeters(seg.lengthM, 2), 2.5)}</g>`);
      };
      if (chains.y.segments.length > 1) chains.y.segments.forEach((seg) => vLine(seg, DIM_ROW_SEGMENT_MM));
      vLine(chains.y.outer, DIM_ROW_OUTER_MM);
    }
  }

  // Notizen, Symbole und Messlinien an denselben Koordinaten wie im Editor.
  for (const a of s.annotations ?? []) {
    if (a.kind === 'text') {
      out.push(textEl(ox + a.x * k, oy + a.y * k, a.text, { size: 3 }));
      continue;
    }
    if (a.kind === 'symbol') {
      const frame = a.symbol === 'notausgang' ? EXIT_COLOR : PANEL_STROKE;
      const ax = ox + a.x * k;
      const ay = oy + a.y * k;
      const sw = SYMBOL_W_M * k;
      const sh = SYMBOL_H_M * k;
      out.push(`<rect x="${num(ax)}" y="${num(ay)}" width="${num(sw)}" height="${num(sh)}" rx="0.8" fill="#ffffff" stroke="${frame}" stroke-width="0.4"/>`);
      out.push(textEl(ax + sw / 2, ay + sh / 2 + 1.1, SYMBOL_LABELS[a.symbol], { size: 3, anchor: 'middle', fill: frame }));
      continue;
    }
    const x1 = ox + a.x1 * k;
    const y1 = oy + a.y1 * k;
    const x2 = ox + a.x2 * k;
    const y2 = oy + a.y2 * k;
    out.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${PANEL_STROKE}" stroke-width="0.35"/>`);
    out.push(labelBox((x1 + x2) / 2, (y1 + y2) / 2, `${formatMeters(measureLength(a))} m`, 2.8));
  }

  return out;
}

/** Streifen unten: Maßstabsleiste links, Fußfarben-Legende daneben, Plankopf unten rechts. */
function stripSvg(o: ScaledPlanOptions, w: number, h: number, k: number): string[] {
  const out: string[] = [];
  const stripTop = h - PLAN_MARGIN_MM - STRIP_MM;
  const left = PLAN_MARGIN_MM;

  // Maßstabsleiste: 2 m, vier Felder zu 0,5 m abwechselnd schwarz/weiß.
  const barLen = 2 * k;
  const seg = barLen / SCALEBAR_FIELDS;
  const barY = stripTop + 6;
  out.push(`<g data-scalebar-length="${num(barLen)}">`);
  for (let i = 0; i < SCALEBAR_FIELDS; i++) {
    const fill = i % 2 === 0 ? '#000000' : '#ffffff';
    out.push(`<rect x="${num(left + i * seg)}" y="${num(barY)}" width="${num(seg)}" height="${num(SCALEBAR_H_MM)}" fill="${fill}" stroke="#000000" stroke-width="0.2"/>`);
  }
  const labelY = barY + SCALEBAR_H_MM + 3.5;
  out.push(textEl(left, labelY, '0', { size: 3, anchor: 'middle' }));
  out.push(textEl(left + k, labelY, '1', { size: 3, anchor: 'middle' }));
  out.push(textEl(left + barLen, labelY, '2 m', { size: 3, anchor: 'middle' }));
  out.push(textEl(left, barY + SCALEBAR_H_MM + 8.5, `Maßstab 1:${o.scale}`, { size: 3.2, bold: true }));
  out.push('</g>');

  // Fußfarben-Legende: je vorkommende Höhe ein Kreis mit Beschriftung, bei Bedarf in neuer Zeile.
  const legendX = left + barLen + 15;
  const legendMaxX = w - PLAN_MARGIN_MM - TITLE_BLOCK_MM.w - 8;
  const heights = Array.from(new Set(o.sections.map((s) => s.heightCm))).sort((a, b) => a - b);
  out.push(textEl(legendX, stripTop + 8, 'Fußfarbe nach Bauhöhe', { size: 3, bold: true }));
  let ix = legendX;
  let iy = stripTop + 13.5;
  for (const hcm of heights) {
    if (ix > legendX && ix + LEGEND_ITEM_MM > legendMaxX) {
      ix = legendX;
      iy += LEGEND_ROW_MM;
    }
    out.push(`<g data-foot-legend="${num(hcm)}">`);
    out.push(`<circle cx="${num(ix)}" cy="${num(iy)}" r="${num(FOOT_RADIUS_MM)}" fill="${footColorForHeight(hcm)}" stroke="#000000" stroke-width="0.1"/>`);
    out.push(textEl(ix + 3.5, iy + 1, `${hcm} cm`, { size: 3 }));
    out.push('</g>');
    ix += LEGEND_ITEM_MM;
  }

  // Plankopf unten rechts.
  const bx = w - PLAN_MARGIN_MM - TITLE_BLOCK_MM.w;
  const by = h - PLAN_MARGIN_MM - TITLE_BLOCK_MM.h;
  out.push(`<rect x="${num(bx)}" y="${num(by)}" width="${num(TITLE_BLOCK_MM.w)}" height="${num(TITLE_BLOCK_MM.h)}" fill="#ffffff" stroke="${PANEL_STROKE}" stroke-width="0.4"/>`);
  out.push(textEl(bx + 3, by + 7, o.title, { size: 4, bold: true }));
  if (o.organisation) out.push(textEl(bx + 3, by + 12, o.organisation, { size: 3 }));
  out.push(textEl(bx + 3, by + 16.5, o.dateText, { size: 3 }));
  out.push(textEl(bx + 3, by + 21, `Maßstab 1:${o.scale} · ${o.paper} ${o.orientation}`, { size: 3 }));
  out.push(textEl(bx + 3, by + 25.5, 'NivTec Planungstool', { size: 2.2, fill: '#555555' }));

  return out;
}

/**
 * Baut den kompletten Plan als eigenständiges SVG-Dokument (Größe in mm, Viewbox in mm).
 * Die Abschnitte stehen nebeneinander oben auf dem Papier, unten liegt der Streifen mit
 * Maßstabsleiste, Legende und Plankopf. Ob alles passt, prüft planFitsOnPaper.
 */
export function buildScaledPlanSvg(o: ScaledPlanOptions): string {
  const { w, h } = paperSizeMm(o.paper, o.orientation);
  const k = mmPerMeter(o.scale);

  const body: string[] = [];
  let x0 = PLAN_MARGIN_MM;
  for (const s of o.sections) {
    body.push(...sectionSvg(s, x0, PLAN_MARGIN_MM, k));
    x0 += sectionSizeMm(s, o.scale).w + SECTION_GAP_MM;
  }
  body.push(...stripSvg(o, w, h, k));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" font-family="${FONT_FAMILY}">`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`,
    ...body,
    '</svg>',
  ].join('\n');
}
