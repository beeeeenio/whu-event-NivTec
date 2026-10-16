import { describe, expect, it } from 'vitest';
import { buildPrintHtml } from '../printSvg';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm"><rect/></svg>';
const APPENDIX = '<table><tr><th>Fuß</th></tr></table>';

describe('buildPrintHtml', () => {
  it('setzt Papierformat und Ausrichtung in der @page-Regel (A4 quer)', () => {
    expect(buildPrintHtml(SVG, 'A4', 'quer')).toContain('@page { size: A4 landscape');
  });

  it('setzt Papierformat und Ausrichtung in der @page-Regel (A3 hoch)', () => {
    expect(buildPrintHtml(SVG, 'A3', 'hoch')).toContain('@page { size: A3 portrait');
  });

  it('übernimmt die Papiermaße für die SVG-Größe', () => {
    expect(buildPrintHtml(SVG, 'A4', 'quer')).toContain('svg{display:block;width:297mm;height:210mm}');
    expect(buildPrintHtml(SVG, 'A3', 'hoch')).toContain('svg{display:block;width:297mm;height:420mm}');
  });

  it('bettet das SVG und den Anhang in den Body ein', () => {
    const html = buildPrintHtml(SVG, 'A4', 'quer', APPENDIX);
    expect(html).toContain(`<div class="seite">${SVG}</div>${APPENDIX}</body>`);
  });

  it('ist ein deutsches HTML-Dokument mit UTF-8', () => {
    const html = buildPrintHtml(SVG, 'A4', 'quer');
    expect(html.startsWith('<!doctype html><html lang="de"><head><meta charset="utf-8">')).toBe(true);
  });
});
