/**
 * The Inventory › Stock 4×6 product label (operator 2026-10-08, restructured),
 * top to bottom: the title (stepping smaller as it wraps to 2 or 3 lines),
 * the primary photo centred in the middle, a SKU row — "SKU" on the left, the
 * value on the right, or a short write-in underline at the right end for an on-hold `TMP-` placeholder (a TMP SKU never prints: it cannot
 * sell by that name) — then Notes: the operator's typed notes, or blank ruled
 * lines to write on. ONE canvas is the preview, the station's print and the
 * browser dialog's page, and every print goes through the 4×6 choke point
 * (`printDocuments`), so these labels take whatever route a shipping label
 * takes on that computer: silent thermal, the desktop app, or the dialog.
 */

import { beginWork, isLiveWork, readWork } from '@/lib/background-work/store';
import { currentPrintRoute } from '@/lib/label-prints/current-print-route';
import { printDocuments, type DeskDocument } from '@/lib/label-prints/print-labels';
import { SHIPPING_LABEL_PAPER, type LabelPrintRoute } from '@/lib/label-prints/print-route';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { createLabelCanvas, drawFittedText, LABEL_DPI } from '@/lib/print/labelFaceBitmap';
import type { StaffPrintStockLabelFace, StaffPrintStockLabelPayload } from '@/lib/print/staff-print-bridge';

/** What one label prints. The station job carries exactly these, so both ends draw one face. */
export type StockLabelFace = StaffPrintStockLabelFace;

// ── Geometry, in inches on the 4 × 6 portrait face, top to bottom ───────────
/** The hairline frame sits this far in from the stock's edge (a head never prints to the edge). */
const FRAME_INSET_IN = 0.1;
const FRAME_RADIUS_IN = 0.16;
/** Content's distance inside the frame. */
const PAD_IN = 0.14;
const ROW_GAP_IN = 0.1;
/** Hairline on a 203 dpi thermal head: 2 dots — 1 dot drops out on worn heads. */
const HAIRLINE_DOTS = 2;
/**
 * Title sizes by how many lines it takes: one line reads at arm's length on
 * a shelf; a title that breaks steps down so two or three lines still fit
 * whole and readable (owner 2026-10-08). Past three lines at the smallest
 * size, the third line ends in `…`. A 203 dpi head paints solid stems at all three.
 */
const TITLE_STEPS: readonly { sizeIn: number; lines: number }[] = [
  { sizeIn: 0.3, lines: 1 },
  { sizeIn: 0.24, lines: 2 },
  { sizeIn: 0.19, lines: 3 },
];
/** The SKU value, right of its "SKU" label (owner 2026-10-08). */
const SKU_TEXT_IN = 0.16;
/** The SKU row is tall enough to hand-write a SKU on its line. */
const SKU_ROW_IN = 0.32;
/** The row's baseline sits this far above its bottom, so descenders stay inside. */
const SKU_BASELINE_LIFT_IN = 0.06;
/** An on-hold SKU's write-in underline: the right 3/8 of the row (owner 2026-10-08), not the full row. */
const SKU_LINE_FRACTION = 3 / 8;
const NOTES_HEADING_IN = 0.13;
const NOTES_TEXT_IN = 0.2;
const NOTES_RADIUS_IN = 0.12;
/** Notes bubble's own inner padding. */
const NOTES_PAD_IN = 0.1;
/** Room the Notes bubble always keeps under the photo: the heading and about four lines to write on. */
const NOTES_RESERVE_IN = 1.4;
/** Spacing of the blank write-in lines — a pen's handwriting height. */
const WRITE_LINE_PITCH_IN = 0.3;
/** Line pitch as a multiple of the text size. */
const LINE_PITCH = 1.2;
const FONT = 'Arial, Helvetica, sans-serif';

/** The browser print dialog on a 4 × 6 page — the fallback every computer has. */
const DIALOG_ROUTE: LabelPrintRoute = { channel: 'BROWSER_DIALOG', printerName: null, paper: SHIPPING_LABEL_PAPER };

/**
 * Word wrap by measured width: the operator's line breaks are kept, a word
 * wider than the line is broken, and the last line ends in `…` when text is
 * left over.
 */
function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const fits = (value: string) => context.measureText(value).width <= maxWidth;
  const lines: string[] = [];
  let truncated = false;
  const push = (line: string): boolean => {
    if (lines.length >= maxLines) {
      truncated = true;
      return false;
    }
    lines.push(line);
    return true;
  };
  paragraphs: for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      let next = line ? `${line} ${rest}` : rest;
      while (!fits(next)) {
        if (line) {
          if (!push(line)) break paragraphs;
          line = '';
          next = rest;
          continue;
        }
        let cut = rest.length - 1;
        while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1;
        if (!push(rest.slice(0, cut))) break paragraphs;
        rest = rest.slice(cut);
        next = rest;
      }
      line = next;
    }
    if (!push(line)) break;
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (truncated && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 0 && !fits(`${last}…`)) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

/**
 * Floyd–Steinberg to pure black and white. A thermal head only heats a dot
 * or not: a photo left in grey prints as blots, a dithered one prints as a
 * photo — and the preview shows exactly those dots.
 */
function ditherToInk(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  const image = context.getImageData(x, y, width, height);
  const px = image.data;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  }
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const i = row * width + col;
      const ink = gray[i] < 128 ? 0 : 255;
      const error = gray[i] - ink;
      gray[i] = ink;
      if (col + 1 < width) gray[i + 1] += (error * 7) / 16;
      if (row + 1 < height) {
        if (col > 0) gray[i + width - 1] += (error * 3) / 16;
        gray[i + width] += (error * 5) / 16;
        if (col + 1 < width) gray[i + width + 1] += error / 16;
      }
    }
  }
  for (let i = 0; i < gray.length; i += 1) {
    px[i * 4] = gray[i];
    px[i * 4 + 1] = gray[i];
    px[i * 4 + 2] = gray[i];
    px[i * 4 + 3] = 255;
  }
  context.putImageData(image, x, y);
}

/**
 * The photo's bytes, read on this origin — never an `<img>` that may follow
 * the full-size photo's redirect to signed storage, which would taint the
 * canvas and stop it printing. Null when it cannot be read; the label prints
 * without it (and the preview shows that).
 */
async function loadPhoto(path: string): Promise<ImageBitmap | null> {
  // `download=1` streams a photo's full bytes here instead of redirecting to storage.
  const url = path.startsWith('/api/photos/') ? `${path}?download=1` : path;
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.type.startsWith('image/') ? await createImageBitmap(blob) : null;
  } catch {
    return null;
  }
}

/**
 * One face on a 4 × 6 canvas at the thermal head's resolution, pure black on
 * white: a rounded hairline frame; the title centred on top over a hairline
 * rule; the photo centred in the middle; the SKU row ("SKU" left, value
 * right — a short write-in underline instead for an on-hold `TMP-` placeholder); then a
 * rounded Notes bubble filling the rest — the typed notes, or ruled lines to
 * write on. The photo takes what the title, SKU row and Notes bubble leave.
 */
export async function drawStockLabel(face: StockLabelFace): Promise<HTMLCanvasElement> {
  const { canvas, context, width, height } = createLabelCanvas(SHIPPING_LABEL_PAPER, LABEL_DPI);
  const at = (inches: number) => Math.round(inches * LABEL_DPI);
  const frame = at(FRAME_INSET_IN);
  const left = frame + at(PAD_IN);
  const inner = width - left * 2;
  const center = width / 2;
  const bottom = height - frame - at(PAD_IN);
  const gap = at(ROW_GAP_IN);
  // A TMP SKU never prints, whatever the sender flagged.
  const onHold = face.onHold || isProvisionalSku(face.sku);
  const skuRow = at(SKU_ROW_IN) + gap;
  // Strokes centre on the path: a half-dot offset keeps a 2-dot line on whole dots.
  const half = HAIRLINE_DOTS / 2;
  context.fillStyle = '#000';
  context.strokeStyle = '#000';
  context.lineWidth = HAIRLINE_DOTS;

  // The frame.
  context.beginPath();
  context.roundRect(frame + half, frame + half, width - frame * 2 - HAIRLINE_DOTS, height - frame * 2 - HAIRLINE_DOTS, at(FRAME_RADIUS_IN));
  context.stroke();
  let y = frame + at(PAD_IN);

  // The title, centred on top, then a hairline rule across the frame.
  // The largest step whose line budget holds the whole title; the last step truncates.
  context.textAlign = 'center';
  let titleSize = 0;
  let titleLines: string[] = [];
  for (const [index, step] of TITLE_STEPS.entries()) {
    titleSize = at(step.sizeIn);
    context.font = `700 ${titleSize}px ${FONT}`;
    const last = index === TITLE_STEPS.length - 1;
    titleLines = wrapText(context, face.title, inner, last ? step.lines : step.lines + 1);
    if (last || titleLines.length <= step.lines) break;
  }
  const titleStep = Math.round(titleSize * LINE_PITCH);
  for (const line of titleLines) {
    context.fillText(line, center, y);
    y += titleStep;
  }
  y += gap - Math.round(titleSize * (LINE_PITCH - 1));
  context.fillRect(frame, y, width - frame * 2, HAIRLINE_DOTS);
  y += HAIRLINE_DOTS + gap;

  // The primary photo in the middle, centred, as big as the room between rule and SKU / Notes allows.
  const photo = face.image ? await loadPhoto(face.image) : null;
  if (photo) {
    const box = bottom - y - skuRow - at(NOTES_RESERVE_IN) - gap;
    if (box > 0) {
      const scale = Math.min(inner / photo.width, box / photo.height);
      const w = Math.max(1, Math.round(photo.width * scale));
      const h = Math.max(1, Math.round(photo.height * scale));
      const x = left + Math.round((inner - w) / 2);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(photo, x, y, w, h);
      ditherToInk(context, x, y, w, h);
      y += h + gap;
    }
    photo.close();
  }

  // The SKU row: "SKU" on the left; the value on the right, or a short write-in underline at the right end when on hold.
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  const baseline = y + at(SKU_ROW_IN) - at(SKU_BASELINE_LIFT_IN);
  const labelSize = at(NOTES_HEADING_IN);
  context.font = `700 ${labelSize}px ${FONT}`;
  context.fillText('SKU', left, baseline);
  const valueLeft = left + Math.ceil(context.measureText('SKU').width) + gap;
  if (onHold) {
    const lineWidth = Math.round(inner * SKU_LINE_FRACTION);
    context.fillRect(left + inner - lineWidth, baseline + HAIRLINE_DOTS, lineWidth, HAIRLINE_DOTS);
  } else {
    context.textAlign = 'right';
    drawFittedText(context, face.sku, left + inner, baseline, left + inner - valueLeft, at(SKU_TEXT_IN), 700);
    context.textAlign = 'left';
  }
  context.textBaseline = 'top';
  y += skuRow;

  // The Notes bubble — a rounded hairline box to the bottom: heading, then typed notes or write-in lines.
  const headingSize = at(NOTES_HEADING_IN);
  const headingStep = Math.round(headingSize * LINE_PITCH);
  const pad = at(NOTES_PAD_IN);
  if (bottom - y < headingStep + pad * 2) return canvas;
  context.beginPath();
  context.roundRect(left + half, y + half, inner - HAIRLINE_DOTS, bottom - y - HAIRLINE_DOTS, at(NOTES_RADIUS_IN));
  context.stroke();
  const textLeft = left + pad;
  const textWidth = inner - pad * 2;
  const textBottom = bottom - pad;
  y += pad;
  context.font = `700 ${headingSize}px ${FONT}`;
  context.fillText('NOTES', textLeft, y);
  y += headingStep + Math.round(gap / 2);
  const notes = face.notes.trim();
  if (notes) {
    const notesSize = at(NOTES_TEXT_IN);
    const notesStep = Math.round(notesSize * LINE_PITCH);
    const room = Math.floor((textBottom - y) / notesStep);
    context.font = `400 ${notesSize}px ${FONT}`;
    for (const line of room > 0 ? wrapText(context, notes, textWidth, room) : []) {
      context.fillText(line, textLeft, y);
      y += notesStep;
    }
  } else {
    const pitch = at(WRITE_LINE_PITCH_IN);
    for (let rule = y + pitch; rule <= textBottom; rule += pitch) {
      context.fillRect(textLeft, rule - HAIRLINE_DOTS, textWidth, HAIRLINE_DOTS);
    }
  }
  return canvas;
}

/**
 * Print stock labels on THIS computer, one 4 × 6 page each: its label route
 * (silent thermal, the desktop app, else ONE browser dialog for the run), or
 * the browser dialog when `dialog` is set. `workId` is the station host's
 * header item. Resolves the reason any did not print, or null.
 */
export async function printStockLabels(
  faces: readonly StockLabelFace[],
  options: { dialog?: boolean; workId?: string } = {},
): Promise<string | null> {
  const docs: DeskDocument[] = [];
  try {
    for (const [index, face] of faces.entries()) {
      const canvas = await drawStockLabel(face);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return `The label for ${face.sku} could not be drawn.`;
      docs.push({
        key: `stock-label:${index}`,
        kind: 'label',
        title: `${face.sku} label`,
        src: URL.createObjectURL(blob),
        stock: 'label',
        ingestionId: null,
        orderId: null,
        documentId: null,
        manualId: null,
      });
    }
    const outcome = await printDocuments(docs, options.dialog ? () => DIALOG_ROUTE : currentPrintRoute, { workId: options.workId });
    if (outcome.cancelled.length > 0) return `Cancelled · ${outcome.printed.length} of ${faces.length} printed`;
    const [first] = outcome.failed;
    if (!first) return null;
    return faces.length === 1 ? first.reason : `${outcome.failed.length} of ${faces.length} did not print — ${first.doc.title}: ${first.reason}`;
  } finally {
    for (const doc of docs) URL.revokeObjectURL(doc.src);
  }
}

/**
 * Station side of sent stock labels (`grain: 'stock_label'`): draw each face
 * here and print the run on this station's label route. Returns the
 * operator-facing failure, or null once all printed.
 */
export async function printStockLabelStationJob(
  job: StaffPrintStockLabelPayload,
  options: { workId?: string } = {},
): Promise<string | null> {
  const count = job.labels.length;
  const label = count === 1 ? `Stock label ${job.labels[0].sku}` : `${count} stock labels`;
  const work = beginWork({ kind: 'print', label, total: count, id: options.workId });
  const failure = await printStockLabels(job.labels, { workId: work.id }).catch((error: unknown) =>
    error instanceof Error ? error.message : 'The stock labels did not print.',
  );
  // The 4 × 6 run settles the item it printed; a run that never reached it fails here.
  const item = readWork(work.id);
  if (failure && item && isLiveWork(item.status)) work.fail(failure);
  return failure;
}
