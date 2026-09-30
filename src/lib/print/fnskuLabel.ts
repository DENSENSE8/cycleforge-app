/** The Amazon FBA unit label — Code 128 FNSKU, the FNSKU in text, the product title (start…end when it does not fit, the way Amazon's own… */

import bwipjs from 'bwip-js/browser';
import { printRawToProfile, resolvePaperSize, silentRawLabelProfile } from '@/lib/print/browserPrint';
import type { PaperSize } from '@/lib/print/browserPrint';
import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { clampLabelCopies } from '@/lib/print/labelCopies';
import { fbaConditionLabel } from '@/lib/fba/fba-conditions';
import { createLabelCanvas, drawFittedText, LABEL_DPI, labelCanvasToRawCommands } from '@/lib/print/labelFaceBitmap';
import { escapeLabelHtml } from '@/lib/print/labelHtml';

export interface FnskuLabelFace {
  fnsku: string;
  /** Catalog product title; blank prints no title line. */
  title: string;
  /** Catalog condition (`Used - Very Good`); blank prints none — never guessed. */
  condition: string;
  /** Printed in place of the condition line, e.g. `TEST PRINT · 2:41 PM` — a sticker that must never ship. */
  mark?: string;
}

/** How a caller holds and hears a run of stickers. */
export interface FnskuLabelRunControl {
  /** Awaited before each silent sticker; `false` stops the run there. */
  checkpoint?: () => Promise<boolean>;
  /** After each sticker leaves (the dialog hands over every copy at once). */
  onPrinted?: (printed: number, total: number) => void;
}

export interface FnskuLabelRunResult {
  channel: 'usb' | 'iframe';
  /** Stickers sent to the printer; the dialog counts every copy it was handed. */
  printed: number;
  /** Stopped by the checkpoint before every sticker went. */
  cancelled: boolean;
}

/** Characters of the title's END kept when it is cut — the colour / variant lives there. */
const TITLE_TAIL_CHARS = 14;
/** Two lines of 9px title on the 2" face. */
const TITLE_MAX_CHARS = 64;
/**
 * Code 128 quiet zone, in modules, on EACH side of the bars. The spec floor
 * is 10X; the bars grow into the rest of the face but never into this — a
 * scanner that cannot see white before the start character cannot read it.
 */
const QUIET_MODULES = 10;
/** Bar height on the face (operator 2026-09-25: width grows, height stays). */
const BARS_HEIGHT_IN = 0.36;

/** `Bose SoundDock Series II 30-Pin iPod…Speaker Dock (Black)` — start and end kept. */
function fitTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (t.length <= TITLE_MAX_CHARS) return t;
  const head = t.slice(0, TITLE_MAX_CHARS - TITLE_TAIL_CHARS - 1).trimEnd();
  return `${head}…${t.slice(-TITLE_TAIL_CHARS).trimStart()}`;
}

// ── Silent (raw thermal) ─────────────────────────────────────────────────────

const dots = (inches: number) => Math.round(inches * LABEL_DPI);

/** Greedy word wrap by measured width, at most `maxLines`. */
function measuredLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/**
 * Operator 2026-09-25:
 * Operator 2026-09-25: "the barcode must be edge to edge and focused in the
 */
function drawFnskuLabel(face: FnskuLabelFace, paper: PaperSize): HTMLCanvasElement {
  const { canvas, context, width } = createLabelCanvas(paper);
  const padX = dots(0.05);
  const padY = dots(0.04);
  const inner = width - padX * 2;

  // scale 1 → one canvas pixel per module, so `bars.width` IS the module count.
  const bars = document.createElement('canvas');
  bwipjs.toCanvas(bars, { bcid: 'code128', text: face.fnsku, scale: 1, height: 8, includetext: false });
  const module = Math.max(1, Math.floor(width / (bars.width + QUIET_MODULES * 2)));
  const barsWidth = bars.width * module;
  const barsHeight = dots(BARS_HEIGHT_IN);
  context.imageSmoothingEnabled = false;
  context.drawImage(bars, Math.round((width - barsWidth) / 2), padY, barsWidth, barsHeight);

  context.textAlign = 'center';
  const codeSize = dots(0.11);
  let y = padY + barsHeight + dots(0.01);
  drawFittedText(context, face.fnsku, width / 2, y, inner, codeSize, 800);
  y += codeSize + dots(0.02);

  // Title, then a quieter condition line. The condition is supporting product
  // information, not a second headline.
  context.textAlign = 'left';
  const titleSize = dots(0.09);
  const lineStep = titleSize + dots(0.01);
  context.font = `600 ${titleSize}px Arial, sans-serif`;
  for (const line of measuredLines(context, fitTitle(face.title), inner, 2)) {
    context.fillText(line, padX, y);
    y += lineStep;
  }

  const condition = face.mark ?? fbaConditionLabel(face.condition);
  if (condition) drawFittedText(context, condition, padX, y, inner, dots(0.075), 600);
  return canvas;
}

/**
 * The one rendered label face. Preview, raw thermal output, and browser
 * fallback printing all consume this raster so screen and paper cannot drift.
 * Defaults to the station's 2×1 FNSKU stock.
 */
export function fnskuLabelPreviewUrl(face: FnskuLabelFace, paper: PaperSize = resolvePaperSize('2x1')): string {
  return drawFnskuLabel(face, paper).toDataURL('image/png');
}

// ── Browser fallback ─────────────────────────────────────────────────────────

/** Copies of the shared raster, one 2×1 print page each. */
function buildFnskuLabelHtml(face: FnskuLabelFace, copies: number): string {
  const rasterUrl = fnskuLabelPreviewUrl(face);
  const pages = Array.from({ length: copies }, () => '<div class="wrap"><img class="label" alt=""></div>').join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeLabelHtml(face.fnsku)}</title>
<style>
  @page{size:2in 1in;margin:0}
  *{box-sizing:border-box}
  html,body{width:2in;margin:0;padding:0;background:#fff}
  .wrap{width:2in;height:1in;overflow:hidden;break-after:page;page-break-after:always}
  .wrap:last-child{break-after:auto;page-break-after:auto}
  .label{display:block;width:2in;height:1in;object-fit:contain}
</style></head><body>
${pages}
<script>
window.onload=function(){
  var source=${JSON.stringify(rasterUrl)};
  var labels=document.querySelectorAll('.label');
  for(var i=0;i<labels.length;i++)labels[i].src=source;
  setTimeout(function(){window.focus();window.print();},120);
};
window.onafterprint=function(){setTimeout(function(){window.close();},80);};
</script>
</body></html>`;
}

/**
 * Print `copies` FNSKU labels. Silent: one raw job per sticker, with the
 * caller's checkpoint before each — so a pause or cancel lands between
 * stickers. A raw failure hands the rest to the browser dialog as ONE job.
 */
export async function printFnskuLabelJob(
  face: FnskuLabelFace,
  copies: number,
  control: FnskuLabelRunControl = {},
): Promise<FnskuLabelRunResult> {
  const total = clampLabelCopies(copies);
  let printed = 0;
  const profile = silentRawLabelProfile();
  if (profile) {
    try {
      const paper = resolvePaperSize(profile.paperSizeId);
      const commands = labelCanvasToRawCommands(drawFnskuLabel(face, paper), profile, paper);
      while (printed < total) {
        if (control.checkpoint && !(await control.checkpoint())) return { channel: 'usb', printed, cancelled: true };
        const res = await printRawToProfile(commands, profile);
        if (!res.success) {
          console.warn('printFnskuLabelJob: raw print failed, falling back:', res.reason);
          break;
        }
        printed += 1;
        control.onPrinted?.(printed, total);
      }
      if (printed === total) return { channel: 'usb', printed, cancelled: false };
    } catch (err) {
      console.warn('printFnskuLabelJob: raw print failed, falling back:', err instanceof Error ? err.message : err);
    }
  }
  printHtmlInIframe(buildFnskuLabelHtml(face, total - printed), { name: `FBA label ${face.fnsku}` });
  control.onPrinted?.(total, total);
  return { channel: 'iframe', printed: total, cancelled: false };
}
