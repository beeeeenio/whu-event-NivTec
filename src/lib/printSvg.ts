import { paperSizeMm, type PaperFormat, type PaperOrientation } from './scaledPlan';

/** Druckt ein SVG über ein verstecktes iframe mit passender @page-Regel — der Browser bietet dort „Als PDF speichern“ an. Keine Abhängigkeit, kein Server. */
export function printSvgDocument(svg: string, paper: PaperFormat, orientation: PaperOrientation, appendixHtml = ''): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.srcdoc = buildPrintHtml(svg, paper, orientation, appendixHtml);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      remove();
      return;
    }
    win.addEventListener('afterprint', remove);
    win.focus();
    win.print();
  };

  document.body.appendChild(frame);
  // Sicherheitsnetz, falls der Browser kein afterprint meldet.
  window.setTimeout(remove, 60_000);
}

/** Reiner Teil, testbar: das HTML-Dokument für die Druckansicht. */
export function buildPrintHtml(svg: string, paper: PaperFormat, orientation: PaperOrientation, appendixHtml = ''): string {
  const { w, h } = paperSizeMm(paper, orientation);
  const pageOrientation = orientation === 'quer' ? 'landscape' : 'portrait';
  return (
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Plan</title><style>' +
    `@page { size: ${paper} ${pageOrientation}; margin: 0 } ` +
    'html,body{margin:0} ' +
    `svg{display:block;width:${w}mm;height:${h}mm} ` +
    // Umbruch nur vor einem Anhang, sonst druckt Chrome eine leere zweite Seite.
    '.seite{overflow:hidden} .seite + *{break-before:page;page-break-before:always} ' +
    // Anhang mit Rand (die @page hat keinen) und ohne overflow:hidden, damit lange Tabellen umbrechen.
    '.anhang{padding:12mm;font:10pt Arial,sans-serif} .anhang h2{margin:0 0 4mm;font-size:14pt} ' +
    'table{border-collapse:collapse;font:10pt Arial,sans-serif} td,th{border:1px solid #bbb;padding:2px 6px}' +
    `</style></head><body><div class="seite">${svg}</div>${appendixHtml}</body></html>`
  );
}
