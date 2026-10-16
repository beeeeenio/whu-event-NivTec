/**
 * Druckbilder für Forex-Blenden verkleinern bzw. in Streifen schneiden — gleiches Verfahren wie in
 * der Stadthallenplanung (src/utils/printImage.ts dort), damit ein Druck in beiden Tools gleich aussieht.
 */

/** Bild laden (Datei oder Data-URL) als HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    img.src = src;
  });
}

function toJpeg(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, maxPx: number): string {
  const scale = Math.min(1, maxPx / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

/** Ein Druckbild waagerecht in Streifen schneiden, Breitenanteile wie `widths` (Kantenlängen in m). */
export async function slicePrint(file: File, widths: number[], maxPx = 1600): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const total = widths.reduce((s, w) => s + w, 0);
    let x = 0;
    return widths.map((w) => {
      const sw = (img.width * w) / total;
      const part = toJpeg(img, x, 0, sw, img.height, maxPx);
      x += sw;
      return part;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
