/**
 * A printable document (a label PDF, a packing slip, a manual — PDF or
 * image) → one image per page, rastered onto its stock at the thermal head's
 * resolution. The document pane shows exactly these images and every print
 * channel prints exactly these images, so the preview is the print.
 */
import { loadPdfjs, PDFJS_STANDARD_FONT_DATA_URL } from '@/lib/manuals/pdfThumbnail';
import type { PaperSize } from '@/lib/print/browserPrint';
import { createLabelCanvas } from '@/lib/print/labelFaceBitmap';

/** Data URLs, one per page, each `paper` at 203 dpi. */
export type LabelPages = readonly string[];

/** Recently rastered documents — walking the list back and forth never re-fetches. */
const RASTER_CACHE_LIMIT = 60;
const rasterCache = new Map<string, Promise<LabelPages>>();

/** Paper pages carry photos and long manuals: JPEG keeps them small; a 4×6 label stays lossless for its barcodes. */
function encode(canvas: HTMLCanvasElement, paper: PaperSize): string {
  return paper.heightIn > 6 ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
}

/** Fit `width × height` onto the stock, turning it a quarter when its orientation disagrees. */
function placement(width: number, height: number, stock: { width: number; height: number }) {
  const turn = width > height !== stock.width > stock.height;
  const w = turn ? height : width;
  const h = turn ? width : height;
  const scale = Math.min(stock.width / w, stock.height / h);
  return { turn, scale, dx: Math.round((stock.width - w * scale) / 2), dy: Math.round((stock.height - h * scale) / 2) };
}

async function rasterizePdf(bytes: Uint8Array, paper: PaperSize): Promise<LabelPages> {
  const pdfjs = await loadPdfjs();
  // Glyphs as paths from the font program (`disableFontFace`), not browser
  // FontFace text: carrier labels' non-embedded Helvetica drawn as canvas text
  // mis-set its baselines (the USPS service "G" fell onto the GROUND
  // ADVANTAGE line; "USPS TRACKING #" sat on its barcode). Verified 2026-09-27.
  const task = pdfjs.getDocument({ data: bytes, standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL, useSystemFonts: false, disableFontFace: true });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const { canvas, width, height } = createLabelCanvas(paper);
      const natural = page.getViewport({ scale: 1 });
      const { turn, scale, dx, dy } = placement(natural.width, natural.height, { width, height });
      const viewport = page.getViewport({ scale, rotation: (page.rotate + (turn ? 90 : 0)) % 360 });
      await page.render({ canvas, viewport, transform: [1, 0, 0, 1, dx, dy], intent: 'print' }).promise;
      page.cleanup();
      pages.push(encode(canvas, paper));
    }
  } finally {
    task.destroy().catch(() => {});
  }
  return pages;
}

async function rasterizeImage(blob: Blob, paper: PaperSize): Promise<LabelPages> {
  const bitmap = await createImageBitmap(blob);
  const { canvas, context, width, height } = createLabelCanvas(paper);
  const { turn, scale, dx, dy } = placement(bitmap.width, bitmap.height, { width, height });
  context.save();
  context.translate(dx, dy);
  if (turn) {
    context.translate(bitmap.height * scale, 0);
    context.rotate(Math.PI / 2);
  }
  context.drawImage(bitmap, 0, 0, bitmap.width * scale, bitmap.height * scale);
  context.restore();
  bitmap.close();
  return [encode(canvas, paper)];
}

async function rasterizeSource(src: string, paper: PaperSize): Promise<LabelPages> {
  const response = await fetch(src, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } | string } | null;
    const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
    throw new Error(message ?? `The document could not be read (${response.status}).`);
  }
  const blob = await response.blob();
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const isPdf = String.fromCharCode(...head) === '%PDF-' || blob.type.includes('pdf');
  if (isPdf) return rasterizePdf(new Uint8Array(await blob.arrayBuffer()), paper);
  if (blob.type.startsWith('image/')) return rasterizeImage(blob, paper);
  throw new Error(`Cannot print ${blob.type || 'this file type'}.`);
}

/** The document's pages on `paper` — cached per source and stock. */
export function rasterizeDocument(src: string, paper: PaperSize): Promise<LabelPages> {
  const key = `${src}:${paper.id}`;
  const cached = rasterCache.get(key);
  if (cached) {
    rasterCache.delete(key);
    rasterCache.set(key, cached);
    return cached;
  }
  const job = rasterizeSource(src, paper);
  job.catch(() => rasterCache.delete(key));
  rasterCache.set(key, job);
  for (const oldest of rasterCache.keys()) {
    if (rasterCache.size <= RASTER_CACHE_LIMIT) break;
    rasterCache.delete(oldest);
  }
  return job;
}
