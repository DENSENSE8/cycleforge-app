/** The Amazon FBA unit label — Code 128 FNSKU, the FNSKU in text, the product title (start…end when it does not fit, the way Amazon's own… */

import bwipjs from 'bwip-js/browser';
import { getProfileForRole, printRawToProfile, resolvePaperSize } from '@/lib/print/browserPrint';
import type { PaperSize } from '@/lib/print/browserPrint';
import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { clampLabelCopies } from '@/lib/print/labelCopies';
import { fbaConditionLabel } from '@/lib/fba/fba-conditions';
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

  const condition = fbaConditionLabel(face.condition);
  if (condition) drawFittedText(context, condition, padX, y, inner, dots(0.075), 600);
  return canvas;
}

/**
 * The face exactly as the thermal head draws it (same canvas), as a PNG data
 * URL — the Print station previews the sticker before it is sent. 2×1 unless
 * a paper is given.
 */
export function fnskuLabelPreviewUrl(face: FnskuLabelFace, paper: PaperSize = resolvePaperSize('2x1')): string {
  return drawFnskuLabel(face, paper).toDataURL('image/png');
}

// ── Fallback (HTML) ──────────────────────────────────────────────────────────

/** The same face as HTML, `copies` stickers as `copies` pages of ONE document (one print dialog / one kiosk print). */
function buildFnskuLabelHtml(face: FnskuLabelFace, copies: number): string {
  const svg = bwipjs
    .toSVG({ bcid: 'code128', text: face.fnsku, scale: 1, height: 8, includetext: false })
    .replace('<svg ', '<svg preserveAspectRatio="none" ');
  const modules = Number(/viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg)?.[1]) || 0;
  const quietPct = modules > 0 ? (QUIET_MODULES / (modules + QUIET_MODULES * 2)) * 100 : 5;
  const title = fitTitle(face.title);
  const condition = fbaConditionLabel(face.condition);
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
  html,body{width:2in;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
  .wrap{width:2in;height:1in;padding:0.04in 0;display:flex;flex-direction:column;overflow:hidden;break-after:page;page-break-after:always}
  .wrap:last-child{break-after:auto;page-break-after:auto}
  .bars{height:${BARS_HEIGHT_IN}in;flex:none;padding:0 ${quietPct.toFixed(4)}%}
  .bars svg{height:100%;width:100%;display:block}
  .code,.title,.cond{padding:0 0.05in;text-rendering:geometricPrecision}
  .code{font-size:8pt;font-weight:800;text-align:center;letter-spacing:0.04em;line-height:1.1}
  .title{font-size:6.5pt;font-weight:600;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
  .cond{font-size:6pt;font-weight:600;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head><body>
${Array.from({ length: copies }, () => sticker).join('\n')}
<script>
window.onload=function(){setTimeout(function(){window.focus();window.print();},120);};
window.onafterprint=function(){setTimeout(function(){window.close();},80);};
</script>
</body></html>`;
}

/** Print `copies` FNSKU labels: */
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
