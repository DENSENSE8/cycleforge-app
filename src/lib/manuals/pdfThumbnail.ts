/** Client-side PDF → PNG thumbnail generator. */

const THUMB_WIDTH = 320;       // target render width in CSS px
const JPEG_QUALITY = 0.85;     // PNG would be larger; JPEG is fine for a preview

interface PdfThumbnailResult {
  blob: Blob;
  width: number;
  height: number;
}

let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null;

/**
 * pdf.js's metric-exact stand-ins for the 14 standard PDF fonts, served from
 * this origin (`public/pdfjs/standard_fonts/`, copied from
 * `node_modules/pdfjs-dist/standard_fonts`). Carrier labels use NON-embedded
 * Helvetica; without these pdf.js paints it in a fallback face with the wrong
 * metrics and baselines — the USPS service "G" dropped onto the "GROUND
 * ADVANTAGE" line. Pass as `standardFontDataUrl`.
 */
export const PDFJS_STANDARD_FONT_DATA_URL = '/pdfjs/standard_fonts/';

/**
 * The pdf.js worker, served from this origin (`public/pdfjs/`, copied from
 * `node_modules/pdfjs-dist/build/`) so a LAN-only workstation renders PDFs
 * without a CDN. `pdfjs-assets.test.ts` fails when a pdfjs-dist upgrade leaves
 * either copy stale — recopy both then.
 */
export const PDFJS_WORKER_URL = '/pdfjs/pdf.worker.min.mjs';

export async function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const mod = await import('pdfjs-dist');
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return mod;
    })();
  }
  return pdfjsModulePromise;
}

/**
 * Render page 1 of `source` to a JPEG Blob. `source` accepts:
 *   - a File (the operator's upload pick)
 *   - a public URL (lazy-backfill path — we re-fetch the Blob URL)
 */
export async function generatePdfThumbnail(
  source: File | string,
): Promise<PdfThumbnailResult | null> {
  try {
    const pdfjs = await loadPdfjs();
    const data =
      typeof source === 'string'
        ? await fetch(source).then((r) => {
            if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
            return r.arrayBuffer();
          })
        : await source.arrayBuffer();

    const loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    try {
      const page = await doc.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = THUMB_WIDTH / baseViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // White background — most PDFs render with transparency on missing
      // backgrounds, which looks broken next to other thumbs.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // pdfjs typings drift between minor versions; this `as any` smooths
      // the difference between the v4 `canvas` param and v5+'s shape.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      page.cleanup();

      const blob: Blob | null = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
      });
      if (!blob) return null;
      return { blob, width: canvas.width, height: canvas.height };
    } finally {
      loadingTask.destroy().catch(() => {});
    }
  } catch (err) {
    // Encrypted PDFs, malformed inputs, unsupported sources — all land here.
    // Caller treats null as "no thumbnail; show the file-icon glyph".
    console.warn('[pdfThumbnail] generation failed:', err);
    return null;
  }
}
