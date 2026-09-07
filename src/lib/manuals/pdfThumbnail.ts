/**
 * Client-side PDF → PNG thumbnail generator.
 *
 * Uses pdfjs-dist to render page 1 of the supplied PDF (or any source the
 * library can fetch) to an offscreen canvas, then exports it as a PNG Blob.
 *
 * Why client-side:
 *   - Vercel serverless runtime has no native PDF renderer (no ghostscript,
 *     no poppler), and bundling pdfjs + a canvas polyfill on the server
 *     adds ~10MB and a cold-start hit.
 *   - The operator's browser already has the PDF bytes in memory at upload
 *     time, so generating the thumb client-side is free network-wise.
 *
 * pdfjs ships its rendering loop on a Web Worker. We point at a same-origin
 * copy of the worker file in public/ (see loadPdfjs) — no third-party origin
 * is ever fetched. If rendering fails, the generator returns null and the
 * caller falls back to no thumbnail.
 *
 * Returns null on any failure (encrypted PDF, render error, unsupported
 * source). Callers must treat the result as best-effort.
 */
import type { getDocument } from 'pdfjs-dist';

const THUMB_WIDTH = 320;       // target render width in CSS px
const JPEG_QUALITY = 0.85;     // PNG would be larger; JPEG is fine for a preview

export interface PdfThumbnailResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * pdfjs-dist version whose worker is self-hosted at public/pdf.worker.min.mjs.
 * MUST be kept in lockstep with package.json: after upgrading pdfjs-dist,
 * re-copy node_modules/pdfjs-dist/build/pdf.worker.min.mjs to that path and
 * update this constant. A main/worker version mismatch fails every render,
 * so we complain loudly instead of letting thumbnails silently die.
 */
const SELF_HOSTED_WORKER_VERSION = '6.3.289';

/** The slice of the pdfjs-dist module namespace this file consumes. */
type PdfjsModule = {
  version: string;
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: typeof getDocument;
};

async function loadPdfjsModule(): Promise<PdfjsModule> {
  // Dynamic on purpose: pdfjs-dist (~1.3MB) is browser-only and must stay out
  // of the initial bundle — it loads only when a thumbnail is first requested.
  const mod = await import('pdfjs-dist');
  // Worker source: same-origin copy of pdf.worker.min.mjs served from
  // public/ by Next.js. We previously pinned a version-matched cdnjs URL,
  // but that meant every thumbnail render fetched worker code from a
  // third-party origin. Simply dropping workerSrc is not an option:
  // pdf.js v6 hard-requires it (the fake-worker fallback itself does
  // `import(workerSrc)` and throws when it is unset), and the
  // `new URL(..., import.meta.url)` pattern is bundler-specific — it
  // works under Next.js webpack but breaks under Turbopack and dev-mode
  // HMR, silently 404-ing the worker.
  mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  if (mod.version !== SELF_HOSTED_WORKER_VERSION) {
    console.error(
      `[pdfThumbnail] pdfjs-dist ${mod.version} does not match the self-hosted ` +
        `worker ${SELF_HOSTED_WORKER_VERSION}. Re-copy ` +
        'node_modules/pdfjs-dist/build/pdf.worker.min.mjs to public/pdf.worker.min.mjs.',
    );
  }
  return mod;
}

let pdfjsModulePromise: Promise<PdfjsModule> | null = null;

function loadPdfjs() {
  pdfjsModulePromise ??= loadPdfjsModule();
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

    // pdfjs v6 notes: `isEvalSupported` is gone entirely — the eval-based
    // font/PostScript code paths were removed from the library (the
    // arbitrary-JS-on-PDF-open advisory class), so PDF content can no longer
    // reach eval() and there is no option left to disable.
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

      // v6 render params: `canvas` is the primary parameter; `canvasContext`
      // is a backcompat shim that requires canvas to be null. Pass the canvas.
      await page.render({ canvas, viewport }).promise;
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
