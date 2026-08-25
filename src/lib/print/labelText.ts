/**
 * Label text fitting — the one place a label decides where its lines break and
 * how large its text may be. Both label command builders
 * (`labelCommands.ts`, `productLabelCommands.ts`) call in here; neither carries
 * its own copy any more.
 *
 * A label has TWO font models, and the old shared `wrap(text, maxChars, maxLines)`
 * served both of them badly:
 *
 *   - The RASTER face (`build*BitmapCommands`) draws real, proportional Arial
 *     onto a canvas before packing it into a TSPL2 `BITMAP`. Width is the only
 *     thing that matters there and it is measurable, so `wrapToWidth` measures
 *     it with `@chenglou/pretext` — which segments and line-breaks using the
 *     browser's font engine as ground truth without ever touching the DOM, so
 *     no `getBoundingClientRect`/`offsetHeight` reflow is forced to print a
 *     sticker. Character counting cannot work here: `WWWWWWWWWWWWWWWWWWWWWW`
 *     and `iiiiiiiiiiiiiiiiiiiiii` are both 22 characters and differ ~3x in
 *     printed width, and `.split(/\s+/)` cannot wrap CJK at all — a Chinese or
 *     Japanese product title has no spaces, so it stayed one unbreakable
 *     "word" and ran off the edge of the label.
 *
 *   - The NATIVE command languages (TSPL `TEXT`, ZPL `^FD`, ESC/POS) hand the
 *     string to printer-resident firmware fonts. Nothing in this process can
 *     measure those, so a CELL COUNT is the honest model — `wrapMonospace`.
 *     It still segments with `Intl.Segmenter` rather than `/\s+/`, so CJK gets
 *     real break opportunities instead of one endless word.
 *
 * Both return the same shape, and both REPORT truncation instead of swallowing
 * it. The previous `lines.slice(0, maxLines)` sliced text off a physical
 * sticker with no signal to anyone: not to the caller, and not to the operator
 * holding it. Truncated text now ends in an ellipsis on the label and sets
 * `truncated` on the way out.
 */

import { layoutWithLines, measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext';

export interface FittedLines {
  /** Lines to print, in order. Never longer than `maxLines`. */
  lines: string[];
  /** The text that did not fit. Empty when nothing was cut. */
  overflow: string;
  /** True when `overflow` is non-empty; the last kept line carries an ellipsis. */
  truncated: boolean;
}

const EMPTY: FittedLines = { lines: [], overflow: '', truncated: false };

/**
 * The raster face is drawn onto a canvas, so it can carry a real ellipsis. The
 * native languages cannot: `sendRaw` encodes the command string as UTF-8 while
 * TSPL runs `CODEPAGE 1252`, so U+2026 would arrive as three garbage cells.
 */
const WIDTH_ELLIPSIS = '…';
const CELL_ELLIPSIS = '...';

/**
 * The family the raster face actually draws with. Declared once so a caller
 * measuring text and the code painting it cannot drift apart — measuring with
 * the wrong font stack is worse than a character count, because it looks
 * authoritative.
 */
export const LABEL_FONT_FAMILY = 'Arial, sans-serif';

/** Floor for shrink-to-fit. Below this the thermal head stops resolving glyphs. */
export const MIN_LABEL_FONT_PX = 8;

/** Canvas font shorthand for the label face, in the family it is drawn with. */
export function labelFont(weight: number, sizePx: number): string {
  return `${weight} ${sizePx}px ${LABEL_FONT_FAMILY}`;
}

/**
 * TSPL internal fonts are fixed-pitch bitmaps, so their cell width in dots is
 * exact — no measurement needed and none available.
 */
export const TSPL_FONT_CELL_WIDTH: Readonly<Record<'1' | '2' | '3', number>> = {
  '1': 8,
  '2': 12,
  '3': 16,
};

/**
 * `^A0` is a SCALABLE, PROPORTIONAL font: `^A0N,h,w`'s `w` declares the cell a
 * glyph is scaled into, not the advance it actually takes. Helvetica-class
 * Latin text averages roughly 0.6 of that cell, so budgeting at the full
 * declared width wastes ~40% of the line while budgeting at one dot per
 * character overflows it. This is an approximation ON PURPOSE and it is the
 * only one in this file: the printer's font metrics are not reachable from
 * here, and the path the CX418 actually takes is the raster one, which is
 * measured rather than estimated.
 */
export const ZPL_SCALABLE_AVERAGE_ADVANCE = 0.6;

/** 80 mm roll, Font A: 12-dot cells across 576 printable dots. */
export const ESCPOS_FONT_A_COLUMNS = 42;

/** How many fixed-pitch cells of `cellWidth` dots fit in `availableDots`. */
export function cellsForDots(availableDots: number, cellWidth: number): number {
  if (!(availableDots > 0) || !(cellWidth > 0)) return 1;
  return Math.max(1, Math.floor(availableDots / cellWidth));
}

/** How many `^A0` characters of declared width `declaredWidth` fit, on average. */
export function zplCellsForDots(availableDots: number, declaredWidth: number): number {
  return cellsForDots(availableDots, declaredWidth * ZPL_SCALABLE_AVERAGE_ADVANCE);
}

let graphemeSegmenter: Intl.Segmenter | null = null;
let wordSegmenter: Intl.Segmenter | null = null;

function graphemesOf(text: string): string[] {
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const out: string[] = [];
  for (const { segment } of graphemeSegmenter.segment(text)) out.push(segment);
  return out;
}

/**
 * Break opportunities. `Intl.Segmenter`'s word granularity is dictionary-driven
 * for scripts that do not delimit with spaces, which is exactly the case
 * `/\s+/` could not see.
 */
function breakUnitsOf(text: string): string[] {
  wordSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  const out: string[] = [];
  for (const { segment } of wordSegmenter.segment(text)) out.push(segment);
  return out;
}

function isBlank(segment: string): boolean {
  return segment.trim().length === 0;
}

function naturalWidth(text: string, font: string): number {
  if (!text) return 0;
  return measureNaturalWidth(prepareWithSegments(text, font));
}

export interface WrapToWidthOptions {
  /** Canvas font shorthand; build it with `labelFont()` so it matches the paint. */
  font: string;
  /** Printable width in device pixels (label dots, for the raster face). */
  maxWidth: number;
  maxLines: number;
}

/**
 * Wrap `text` to `maxWidth` by MEASURED width, via pretext. Requires a canvas
 * font engine (`OffscreenCanvas` or a DOM canvas) — every caller is already
 * inside a `typeof document === 'undefined'` guard for the same reason.
 */
export function wrapToWidth(text: string, options: WrapToWidthOptions): FittedLines {
  const source = text.trim();
  if (!source) return EMPTY;

  const maxLines = Math.max(1, options.maxLines);
  const prepared = prepareWithSegments(source, options.font);
  // lineHeight is irrelevant here: the label positions its own rows, and only
  // the line TEXT is wanted. Pass 1 rather than invent a leading.
  const laid = layoutWithLines(prepared, options.maxWidth, 1).lines.map((line) => line.text.trimEnd());

  if (laid.length <= maxLines) {
    return { lines: laid, overflow: '', truncated: false };
  }

  const kept = laid.slice(0, maxLines);
  kept[maxLines - 1] = markCutByWidth(
    kept[maxLines - 1] ?? '',
    options.font,
    options.maxWidth,
  );
  return { lines: kept, overflow: laid.slice(maxLines).join(' '), truncated: true };
}

function markCutByWidth(line: string, font: string, maxWidth: number): string {
  const cells = graphemesOf(line);
  while (cells.length > 0) {
    const candidate = `${cells.join('').trimEnd()}${WIDTH_ELLIPSIS}`;
    if (naturalWidth(candidate, font) <= maxWidth) return candidate;
    cells.pop();
  }
  return WIDTH_ELLIPSIS;
}

export interface WrapMonospaceOptions {
  /** Printable cells on one line — see `cellsForDots` / `zplCellsForDots`. */
  maxCells: number;
  maxLines: number;
}

/**
 * Wrap `text` to `maxCells` fixed-pitch cells per line, counting GRAPHEMES so a
 * combining mark or an emoji sequence is one cell rather than several.
 */
export function wrapMonospace(text: string, options: WrapMonospaceOptions): FittedLines {
  const source = text.trim();
  if (!source) return EMPTY;

  const maxCells = Math.max(1, Math.floor(options.maxCells));
  const maxLines = Math.max(1, options.maxLines);
  const laid: string[] = [];
  let current: string[] = [];
  let pendingSpace = false;

  const flush = () => {
    if (current.length === 0) return;
    laid.push(current.join(''));
    current = [];
  };

  for (const unit of breakUnitsOf(source)) {
    if (isBlank(unit)) {
      pendingSpace = current.length > 0;
      continue;
    }

    let cells = graphemesOf(unit);
    const gap = pendingSpace ? 1 : 0;
    pendingSpace = false;

    if (current.length + gap + cells.length <= maxCells) {
      if (gap) current.push(' ');
      current.push(...cells);
      continue;
    }

    flush();
    // A single unit wider than the whole line (a long SKU, a hashless run of
    // CJK the segmenter kept together) has to be split somewhere; splitting at
    // the cell boundary is the only option a fixed-pitch font leaves.
    while (cells.length > maxCells) {
      laid.push(cells.slice(0, maxCells).join(''));
      cells = cells.slice(maxCells);
    }
    current = cells;
  }
  flush();

  if (laid.length <= maxLines) {
    return { lines: laid, overflow: '', truncated: false };
  }

  const kept = laid.slice(0, maxLines);
  kept[maxLines - 1] = markCutByCells(kept[maxLines - 1] ?? '', maxCells);
  return { lines: kept, overflow: laid.slice(maxLines).join(' '), truncated: true };
}

function markCutByCells(line: string, maxCells: number): string {
  const budget = Math.max(0, maxCells - CELL_ELLIPSIS.length);
  return `${graphemesOf(line).slice(0, budget).join('').trimEnd()}${CELL_ELLIPSIS}`;
}

export interface FitFontSizeOptions {
  /** Builds the canvas font shorthand for a candidate px size. */
  fontAt: (sizePx: number) => string;
  maxWidth: number;
  initialSize: number;
  minSize?: number;
}

/**
 * Largest size at or below `initialSize` whose rendered width fits `maxWidth`.
 *
 * The previous implementation decremented 1px at a time, mutating
 * `context.font` and re-measuring on every step — from 28px that is up to 20
 * font mutations and 20 measurements per field, per label. Canvas advance
 * widths scale linearly with px size, so the answer is one division: measure
 * once at `initialSize` and solve for the ratio. The trailing loop only pays
 * for hinting/rounding slop, which is a step or two at most.
 */
export function fitFontSize(text: string, options: FitFontSizeOptions): number {
  const minSize = options.minSize ?? MIN_LABEL_FONT_PX;
  if (!text || options.initialSize <= minSize) return Math.max(minSize, options.initialSize);

  const natural = naturalWidth(text, options.fontAt(options.initialSize));
  if (natural <= 0 || natural <= options.maxWidth) return options.initialSize;

  let size = Math.max(
    minSize,
    Math.min(options.initialSize, Math.floor((options.initialSize * options.maxWidth) / natural)),
  );
  while (size > minSize && naturalWidth(text, options.fontAt(size)) > options.maxWidth) {
    size -= 1;
  }
  return size;
}

/**
 * Draw one line shrunk to fit `maxWidth`. Shared by both raster label faces;
 * it used to exist verbatim in each of them.
 */
export function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialSize: number,
  weight = 700,
): void {
  const fontAt = (size: number) => labelFont(weight, size);
  context.font = fontAt(fitFontSize(text, { fontAt, maxWidth, initialSize }));
  context.fillText(text, x, y);
}
