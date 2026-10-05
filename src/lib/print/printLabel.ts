import { renderDataMatrixSvg } from '@/lib/barcode/dataMatrixSvg';
import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { LABEL_FACE_SHELL, type LabelFaceModel } from '@/lib/print/labelFace';
import { escapeLabelHtml } from '@/lib/print/labelHtml';
import { isSilentPrintEnabled } from '@/lib/print/printMode';

/** Shared 2×1" DataMatrix label shell. */

// escapeLabelHtml lives in ./labelHtml (dependency-free) so face-model modules
// don't inherit this file's bwip-js graph.

interface LabelDataMatrix {
  value: string;
  symbology: 'gs1datamatrix' | 'datamatrix';
  /** bwip-js module scale. Default 4 — the receiving label's proven density. */
  scale?: number;
}

interface PrintLabelOptions {
  /**
   * Inner HTML of the left `.info` column. The caller owns escaping (use
   * {@link escapeLabelHtml}) and the content classes referenced here.
   */
  infoHtml: string;
  /** The DataMatrix rendered on the right. */
  dataMatrix: LabelDataMatrix;
  /** Caller-specific CSS for the content classes used inside `infoHtml`. */
  infoCss?: string;
  /** Vertical distribution of the `.info` column. Default `space-between`. */
  infoAlign?: 'space-between' | 'center' | 'flex-start' | 'flex-end';
  /** DataMatrix block side length (any CSS length). Default `0.86in`. */
  qrSize?: string;
  /** Label width in inches. Default 2. */
  widthIn?: number;
  /** Label height in inches. Default 1. */
  heightIn?: number;
  /** `<title>` text and popup-blocked log prefix. */
  name?: string;
  /** Silent-print settle delay in ms. Default 250. */
  waitMs?: number;
  /**
   * Optional human-readable handle printed under the DataMatrix (e.g. `R-1234`),
   * the way a barcode prints its digits. Gives the operator a value to type into
   * the scan bar when the symbol won't scan. Omitted → no caption.
   */
  hri?: string;
  /**
   * When true, omit the auto-`window.print` / `onafterprint` script so the same
   * HTML can be shown in an on-screen preview iframe ({@link LabelFacePreview}).
   * Default false — print callers keep the silent-print pipeline.
   */
  preview?: boolean;
  /** Popup reserved synchronously for older browsers. */
  legacyPopup?: Window | null;
  /**
   * Structured face for the WebUSB/Web Serial raster. When omitted, the job
   * still prints USB using name + matrix + HRI so a Print button never skips
   * the paired thermal printer.
   */
  face?: LabelFaceModel;
}

function renderLabelWrap(opts: PrintLabelOptions): string {
  const qrSvg = renderDataMatrixSvg({
    value: opts.dataMatrix.value,
    symbology: opts.dataMatrix.symbology,
    scale: opts.dataMatrix.scale ?? 4,
  });
  const hri = (opts.hri ?? '').trim();
  return `<div class="wrap">
  <div class="info">${opts.infoHtml}</div>
  <div class="qrcol">
    <div class="qr">${qrSvg}</div>
    ${hri ? `<div class="hri">${escapeLabelHtml(hri)}</div>` : ''}
  </div>
</div>`;
}

function assembleLabelDocument(opts: {
  widthIn: number;
  heightIn: number;
  qrSize: string;
  infoAlign: 'space-between' | 'center' | 'flex-start' | 'flex-end';
  infoCss: string;
  title: string;
  preview: boolean;
  pageCount: number;
  pagesHtml: string;
}): string {
  const copies = opts.pageCount;
  const printScript = opts.preview
    ? ''
    : `<script>
window.onload=function(){
  setTimeout(function(){window.focus();window.print();},120);
};
window.onafterprint=function(){setTimeout(function(){window.close();},80);};
</script>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${opts.title}</title>
<style>
  @page{size:${opts.widthIn}in ${opts.heightIn}in;margin:0}
  *,*::before,*::after{box-sizing:border-box}
  html,body{width:${opts.widthIn}in;${copies > 1 ? '' : `height:${opts.heightIn}in;`}padding:0;margin:0;font-family:Arial,sans-serif;color:#111;background:#fff${opts.preview ? ';overflow:hidden' : ''}}
  .wrap{width:${opts.widthIn}in;height:${opts.heightIn}in;display:flex;align-items:stretch;gap:${LABEL_FACE_SHELL.gapCssPx}px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;${opts.preview ? 'padding:0' : `padding:${LABEL_FACE_SHELL.paddingYCssPx}px ${LABEL_FACE_SHELL.paddingXCssPx}px`}${copies > 1 ? ';page-break-after:always;break-after:page' : ''}}
  .wrap:last-of-type{page-break-after:auto;break-after:auto}
  .info{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:${opts.infoAlign};height:100%;width:100%}
  .qrcol{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;margin-left:auto}
  .qr{width:${opts.qrSize};height:${opts.qrSize};display:flex;align-items:center;justify-content:center}
  .qr svg{width:100%;height:100%;display:block}
  .hri{font-size:7px;font-weight:800;letter-spacing:0.3px;line-height:1;color:#111;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}
  ${opts.infoCss}
</style></head><body>
${opts.pagesHtml}
${printScript}
</body></html>`;
}

/** Build the full 2×1 label document — ONE sticker. */
export function buildLabelHtml(opts: PrintLabelOptions): string {
  const widthIn = opts.widthIn ?? LABEL_FACE_SHELL.widthIn;
  const heightIn = opts.heightIn ?? LABEL_FACE_SHELL.heightIn;
  const qrSize = opts.qrSize ?? `${LABEL_FACE_SHELL.matrixSizeIn}in`;
  const pages = renderLabelWrap(opts);
  return assembleLabelDocument({
    widthIn,
    heightIn,
    qrSize,
    infoAlign: opts.infoAlign ?? 'space-between',
    infoCss: opts.infoCss ?? '',
    title: escapeLabelHtml(opts.name ?? 'Label'),
    preview: opts.preview === true,
    pageCount: 1,
    pagesHtml: pages,
  });
}

/**
 * One 2×1 document with a distinct wrap per page — the multi-sticker run
 * (unique faces and repeated plates alike).
 */
export function buildMultiPageLabelHtml(pages: PrintLabelOptions[]): string {
  if (pages.length === 0) {
    return buildLabelHtml({
      name: 'Label',
      infoHtml: '',
      dataMatrix: { value: ' ', symbology: 'datamatrix' },
      preview: true,
    });
  }
  const first = pages[0]!;
  const widthIn = first.widthIn ?? LABEL_FACE_SHELL.widthIn;
  const heightIn = first.heightIn ?? LABEL_FACE_SHELL.heightIn;
  const qrSize = first.qrSize ?? `${LABEL_FACE_SHELL.matrixSizeIn}in`;
  const infoCss = [...new Set(pages.map((p) => p.infoCss ?? '').filter(Boolean))].join('\n');
  const wraps = pages.map((p) => renderLabelWrap(p)).join('');
  return assembleLabelDocument({
    widthIn,
    heightIn,
    qrSize,
    infoAlign: first.infoAlign ?? 'space-between',
    infoCss,
    title: escapeLabelHtml(first.name ?? 'Label'),
    preview: first.preview === true,
    pageCount: pages.length,
    pagesHtml: wraps,
  });
}

/**
 * Print a 2×1" DataMatrix label. When silent printing is on and a USB/serial
 * label profile is paired, this sends a real raw job over WebUSB / Web Serial.
 * Otherwise it falls through to a hidden iframe + `window.print()`.
 */
export function printLabel(opts: PrintLabelOptions): void {
  if (typeof window === 'undefined') return;
  void printLabelJob(opts);
}

/** Awaitable SoT for tests and callers that need the USB result. */
export async function printLabelJob(
  opts: PrintLabelOptions,
): Promise<'usb' | 'iframe'> {
  const html = buildLabelHtml(opts);
  if (opts.preview === true) {
    return 'iframe';
  }
  if (isSilentPrintEnabled()) {
    const { getProfileForRole, printRawToProfile, resolvePaperSize } = await import(
      '@/lib/print/browserPrint'
    );
    const labelProfile = getProfileForRole('label');
    if (labelProfile && labelProfile.kind !== 'os' && labelProfile.language !== 'none') {
      try {
        const { buildPrintLabelRawCommands } = await import('@/lib/print/labelFaceBitmap');
        const paper = resolvePaperSize(labelProfile.paperSizeId);
        const commands = buildPrintLabelRawCommands(opts, labelProfile, paper);
        const res = await printRawToProfile(commands, labelProfile);
        if (res.success) {
          opts.legacyPopup?.close();
          return 'usb';
        }
        console.warn('printLabel: browser raw print failed, falling back:', res.reason);
      } catch (err) {
        console.warn(
          'printLabel: browser raw print failed, falling back:',
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  printHtmlInIframe(html, { name: opts.name ?? 'printLabel', legacyPopup: opts.legacyPopup });
  return 'iframe';
}
