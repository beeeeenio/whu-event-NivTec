import { describe, expect, it } from 'vitest';
import { labeledFootPositions } from '../../domain/feet';
import type { LayoutResult, PanelInstance } from '../../domain/types';
import {
  buildScaledPlanSvg,
  escapeXml,
  mmPerMeter,
  paperSizeMm,
  planFitsOnPaper,
  type ScaledPlanOptions,
  type ScaledPlanSection,
} from '../scaledPlan';

/** Rechteckige Platten (w×d Meter) in einem Raster cols×rows ab dem Ursprung. */
function gridPanels(cols: number, rows: number, w = 2, d = 1): PanelInstance[] {
  const panels: PanelInstance[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      panels.push({ x: i * w, y: j * d, w, d, sizeKey: `${w}x${d}`, isSondermass: false });
    }
  }
  return panels;
}

function layoutOf(panels: PanelInstance[]): LayoutResult {
  const widthM = Math.max(...panels.map((p) => p.x + p.w));
  const depthM = Math.max(...panels.map((p) => p.y + p.d));
  return {
    orientation: 'normal',
    widthM,
    depthM,
    areaM2: widthM * depthM,
    cols: 0,
    rows: 0,
    panels,
    panelCountsBySize: {},
    hasSondermass: false,
  };
}

function section(label: string, panels: PanelInstance[], heightCm: number, extra: Partial<ScaledPlanSection> = {}): ScaledPlanSection {
  const layout = layoutOf(panels);
  return { label, layout, feet: labeledFootPositions(panels), heightCm, ...extra };
}

function options(extra: Partial<ScaledPlanOptions> = {}): ScaledPlanOptions {
  return {
    title: 'Kastenbühne',
    dateText: '16.10.2026',
    scale: 50,
    paper: 'A4',
    orientation: 'quer',
    sections: [section('Unterbau', gridPanels(2, 1), 30)],
    ...extra,
  };
}

describe('paperSizeMm', () => {
  it('liefert alle Kombinationen aus Format und Ausrichtung', () => {
    expect(paperSizeMm('A4', 'quer')).toEqual({ w: 297, h: 210 });
    expect(paperSizeMm('A4', 'hoch')).toEqual({ w: 210, h: 297 });
    expect(paperSizeMm('A3', 'quer')).toEqual({ w: 420, h: 297 });
    expect(paperSizeMm('A3', 'hoch')).toEqual({ w: 297, h: 420 });
  });
});

describe('mmPerMeter', () => {
  it('rechnet 1:50 auf 20 mm je Meter und 1:100 auf 10 mm', () => {
    expect(mmPerMeter(50)).toBe(20);
    expect(mmPerMeter(100)).toBe(10);
  });
});

describe('buildScaledPlanSvg', () => {
  it('setzt die Papiergröße in mm und enthält Maßstabsleiste, Publikumsseite, Plankopf und Legende', () => {
    const svg = buildScaledPlanSvg(options());
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="297mm"');
    expect(svg).toContain('height="210mm"');
    expect(svg).toContain('viewBox="0 0 297 210"');
    expect(svg).toContain('data-scalebar-length="40"');
    expect(svg).toContain('PUBLIKUM');
    expect(svg).toContain('Maßstab 1:50');
    expect(svg).toContain('NivTec Planungstool');
    expect(svg).toContain('>30 cm</text>');
  });

  it('skaliert 1 m auf 20 mm bei 1:50 und auf 10 mm bei 1:100', () => {
    expect(buildScaledPlanSvg(options())).toContain('scale(20)');
    const svg100 = buildScaledPlanSvg(options({ scale: 100, paper: 'A3' }));
    expect(svg100).toContain('data-scalebar-length="20"');
    expect(svg100).toContain('scale(10)');
    expect(svg100).toContain('Maßstab 1:100');
  });

  it('legt für jede vorkommende Höhe genau einen Legenden-Eintrag an', () => {
    const svg = buildScaledPlanSvg(
      options({
        sections: [section('Unterbau', gridPanels(2, 1), 30), section('Oberbau', gridPanels(1, 1), 80), section('Zweit', gridPanels(1, 1), 30)],
      }),
    );
    expect(svg.match(/data-foot-legend="30"/g)).toHaveLength(1);
    expect(svg.match(/data-foot-legend="80"/g)).toHaveLength(1);
    expect(svg).toContain('>80 cm</text>');
  });

  it('zeichnet Maßketten mit echten Maßen, wenn showDimensions gesetzt ist', () => {
    const svg = buildScaledPlanSvg(options({ sections: [section('Unterbau', gridPanels(1, 1), 30, { showDimensions: true })] }));
    expect(svg).toContain('2,00');
  });

  it('escaped den Titel und alle anderen Texte', () => {
    const svg = buildScaledPlanSvg(options({ title: 'A <B> & "C"' }));
    expect(svg).toContain('A &lt;B&gt; &amp; &quot;C&quot;');
    expect(svg).not.toContain('<B>');
  });
});

describe('escapeXml', () => {
  it('maskiert <, &, " und >', () => {
    expect(escapeXml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });
});

describe('planFitsOnPaper', () => {
  it('erkennt einen 4×3 m großen Plan bei 1:50 auf A4 quer als passend', () => {
    const o = options({ sections: [section('Bühne', gridPanels(2, 3), 30)] });
    // gridPanels(2,3) ist 4 m × 3 m
    expect(planFitsOnPaper(o)).toBe(true);
  });

  it('erkennt einen 20×10 m großen Plan bei 1:50 auf A4 quer als zu groß', () => {
    const o = options({ sections: [section('Bühne', gridPanels(10, 10), 30)] });
    expect(planFitsOnPaper(o)).toBe(false);
  });

  it('erkennt einen 20×10 m großen Plan bei 1:100 auf A3 quer als passend', () => {
    const o = options({ scale: 100, paper: 'A3', sections: [section('Bühne', gridPanels(10, 10), 30)] });
    expect(planFitsOnPaper(o)).toBe(true);
  });

  it('zählt Abschnitte nebeneinander mit 15 mm Abstand zusammen', () => {
    // Je 4 m = 80 mm bei 1:50; zwei Abschnitte + Abstand = 175 mm, passt auf A4 quer (277 mm).
    const twoFit = options({ sections: [section('A', gridPanels(2, 3), 30), section('B', gridPanels(2, 3), 30)] });
    expect(planFitsOnPaper(twoFit)).toBe(true);
    // Vier 4-m-Abschnitte = 4·80 + 3·15 = 365 mm > 277 mm.
    const fourTooWide = options({
      sections: [1, 2, 3, 4].map((i) => section(`S${i}`, gridPanels(2, 3), 30)),
    });
    expect(planFitsOnPaper(fourTooWide)).toBe(false);
  });

  it('rechnet Maßketten rechts und unten dazu', () => {
    // 13,5 m × 1 m bei 1:50 = 270 mm breit: passt auf A4 quer (277 mm nutzbar),
    // mit Maßketten (+10 mm rechts) sind es 280 mm und es passt nicht mehr.
    const edgePanels: PanelInstance[] = [{ x: 0, y: 0, w: 13.5, d: 1, sizeKey: '13.5x1', isSondermass: false }];
    expect(planFitsOnPaper(options({ sections: [section('Bühne', edgePanels, 30)] }))).toBe(true);
    expect(planFitsOnPaper(options({ sections: [section('Bühne', edgePanels, 30, { showDimensions: true })] }))).toBe(false);
  });
});
