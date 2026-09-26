/** Client-side PDF → PNG thumbnail generator. */

const THUMB_WIDTH = 320;       // target render width in CSS px
const JPEG_QUALITY = 0.85;     // PNG would be larger; JPEG is fine for a preview

interface PdfThumbnailResult {
  blob: Blob;
  width: number;
  height: number;
}

let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null;

export async function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const mod = await import('pdfjs-dist');
      // Worker source:
      mod.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${mod.version}/pdf.worker.min.mjs`;
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
