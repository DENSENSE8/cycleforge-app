/**
 * The Amazon FBA unit label — Code 128 FNSKU, the FNSKU in text, the product
 * title (start…end when it does not fit, the way Amazon's own label reads) and
 * the condition — on the 2×1" thermal stock every other label here uses.
 *
 * Not a {@link LabelFaceModel}: that face is a DataMatrix beside an info
 * column, and Amazon's receiving scanners read a linear Code 128 across the
 * top of the sticker. The silent path shares the raster plumbing
 * (`createLabelCanvas` → `labelCanvasToRawCommands`); the fallback prints the
 * same layout as HTML through the hidden iframe.
 *
 * Heavy (bwip-js): load it with `import()` on the actual print.
 * Callers: `printFnskuStationJob` (the print station, on a phone's Reprint).
 */

import bwipjs from 'bwip-js/browser';
import { getProfileForRole, printRawToProfile, resolvePaperSize } from '@/lib/print/browserPrint';
import type { PaperSize } from '@/lib/print/browserPrint';
import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { clampLabelCopies } from '@/lib/print/labelCopies';
import { createLabelCanvas, drawFittedText, LABEL_DPI, labelCanvasToRawCommands } from '@/lib/print/labelFaceBitmap';
import { escapeLabelHtml } from '@/lib/print/labelHtml';
import { isSilentPrintEnabled } from '@/lib/print/printMode';

export interface FnskuLabelFace {
  fnsku: string;
  /** Catalog product title; blank prints no title line. */
  title: string;
  /** Catalog condition (`Used - Very Good`); blank prints none — never guessed. */
  condition: string;
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
 * Operator 2026-09-25: "the barcode must be edge to edge and focused in the
 * middle, and condition right below the text, not bottom aligned."
 *
 * Bars: the largest WHOLE-dot module whose run plus both quiet zones fits the
 * full face width, centred — never a smoothed stretch, so every bar edge lands
 * on the head. A 10-character FNSKU is 145 modules, so 2" stock (406 dots)
 * takes 2 dots a module; wider stock takes more.
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

  // Title, then the condition on the very next line — one text flow.
  context.textAlign = 'left';
  const titleSize = dots(0.09);
  const lineStep = titleSize + dots(0.01);
  context.font = `600 ${titleSize}px Arial, sans-serif`;
  for (const line of measuredLines(context, fitTitle(face.title), inner, 2)) {
    context.fillText(line, padX, y);
    y += lineStep;
  }

  const condition = face.condition.trim();
  if (condition) drawFittedText(context, condition, padX, y, inner, titleSize, 800);
  return canvas;
}

// ── Fallback (HTML) ──────────────────────────────────────────────────────────

/**
 * The same face as HTML, `copies` stickers as `copies` pages of ONE document
 * (one print dialog / one kiosk print). The bars span the whole 2" page less
 * the quiet zone, as a percentage of the module count, so they scale with
 * the stock exactly like the raster.
 */
function buildFnskuLabelHtml(face: FnskuLabelFace, copies: number): string {
  const svg = bwipjs
    .toSVG({ bcid: 'code128', text: face.fnsku, scale: 1, height: 8, includetext: false })
    .replace('<svg ', '<svg preserveAspectRatio="none" ');
  const modules = Number(/viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg)?.[1]) || 0;
  const quietPct = modules > 0 ? (QUIET_MODULES / (modules + QUIET_MODULES * 2)) * 100 : 5;
  const title = fitTitle(face.title);
  const condition = face.condition.trim();
  const sticker = `<div class="wrap">
  <div class="bars">${svg}</div>
  <div class="code">${escapeLabelHtml(face.fnsku)}</div>
  ${title ? `<div class="title">${escapeLabelHtml(title)}</div>` : ''}
  ${condition ? `<div class="cond">${escapeLabelHtml(condition)}</div>` : ''}
</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeLabelHtml(face.fnsku)}</title>
<style>
  @page{size:2in 1in;margin:0}
  *{box-sizing:border-box}
  html,body{width:2in;margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}
  .wrap{width:2in;height:1in;padding:0.04in 0;display:flex;flex-direction:column;overflow:hidden;break-after:page;page-break-after:always}
  .wrap:last-child{break-after:auto;page-break-after:auto}
  .bars{height:${BARS_HEIGHT_IN}in;flex:none;padding:0 ${quietPct.toFixed(4)}%}
  .bars svg{height:100%;width:100%;display:block}
  .code,.title,.cond{padding:0 0.05in}
  .code{font-size:10.5px;font-weight:800;text-align:center;letter-spacing:0.5px;line-height:1.1}
  .title{font-size:8.5px;font-weight:600;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
  .cond{font-size:8.5px;font-weight:800;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head><body>
${Array.from({ length: copies }, () => sticker).join('\n')}
<script>
window.onload=function(){setTimeout(function(){window.focus();window.print();},120);};
window.onafterprint=function(){setTimeout(function(){window.close();},80);};
</script>
</body></html>`;
}

/**
 * Print `copies` FNSKU labels: raw over the paired USB/serial label profile
 * when silent printing is on, else (or when that fails) the HTML through the
 * hidden iframe — the same ladder as `printLabelJob`.
 *
 * Copies are PLATES, not a printer repeat count (`labelCopies.expandPlateRun`):
 * the CX418 prints one label per raster job whatever `PRINT N` asks, so the
 * raw path sends the same raster N times, and the HTML path prints N pages.
 * A raw run that fails part-way hands only the stickers still owed to HTML.
 */
export async function printFnskuLabelJob(face: FnskuLabelFace, copies: number): Promise<'usb' | 'iframe'> {
  const total = clampLabelCopies(copies);
  let printed = 0;
  if (isSilentPrintEnabled()) {
    const profile = getProfileForRole('label');
    if (profile && profile.kind !== 'os' && profile.language !== 'none') {
      try {
        const paper = resolvePaperSize(profile.paperSizeId);
        const commands = labelCanvasToRawCommands(drawFnskuLabel(face, paper), profile, paper);
        while (printed < total) {
          const res = await printRawToProfile(commands, profile);
          if (!res.success) {
            console.warn('printFnskuLabelJob: raw print failed, falling back:', res.reason);
            break;
          }
          printed += 1;
        }
        if (printed === total) return 'usb';
      } catch (err) {
        console.warn('printFnskuLabelJob: raw print failed, falling back:', err instanceof Error ? err.message : err);
      }
    }
  }
  printHtmlInIframe(buildFnskuLabelHtml(face, total - printed), { name: `FBA label ${face.fnsku}` });
  return 'iframe';
}
