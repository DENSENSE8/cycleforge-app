/**
 * The Inventory › Stock 4×6 product label (operator 2026-10-08, simplified):
 * top-aligned — the primary photo as a full-width square, the title, the
 * SKU in a small face, then a Notes heading and the notes when there are any.
 * ONE canvas is the preview, the station's print and the browser dialog's
 * page, and every print goes through the 4×6 choke point (`printDocuments`),
 * so these labels take whatever route a shipping label takes on that
 * computer: silent thermal, the desktop app, or the dialog.
 */

import { beginWork, isLiveWork, readWork } from '@/lib/background-work/store';
import { currentPrintRoute } from '@/lib/label-prints/current-print-route';
import { printDocuments, type DeskDocument } from '@/lib/label-prints/print-labels';
import { SHIPPING_LABEL_PAPER, type LabelPrintRoute } from '@/lib/label-prints/print-route';
import { createLabelCanvas, drawFittedText, LABEL_DPI } from '@/lib/print/labelFaceBitmap';
import type { StaffPrintStockLabelFace, StaffPrintStockLabelPayload } from '@/lib/print/staff-print-bridge';

/** What one label prints. The station job carries exactly these, so both ends draw one face. */
export type StockLabelFace = StaffPrintStockLabelFace;

// ── Geometry, in inches on the 4 × 6 portrait face, top to bottom ───────────
const MARGIN_IN = 0.15;
const ROW_GAP_IN = 0.1;
/** Read at arm's length on a shelf; a 203 dpi head paints solid stems. */
const TITLE_TEXT_IN = 0.3;
const TITLE_LINES = 3;
/** The SKU, small under the title (owner 2026-10-08). */
const SKU_TEXT_IN = 0.14;
const NOTES_HEADING_IN = 0.16;
const NOTES_TEXT_IN = 0.2;
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

/** One face on a 4 × 6 canvas at the thermal head's resolution, every row hung from the top. */
export async function drawStockLabel(face: StockLabelFace): Promise<HTMLCanvasElement> {
  const { canvas, context, width, height } = createLabelCanvas(SHIPPING_LABEL_PAPER, LABEL_DPI);
  const at = (inches: number) => Math.round(inches * LABEL_DPI);
  const margin = at(MARGIN_IN);
  const inner = width - margin * 2;
  const gap = at(ROW_GAP_IN);
  let y = margin;

  // The primary photo — as big as the face is wide, inside a full-width square.
  const photo = face.image ? await loadPhoto(face.image) : null;
  if (photo) {
    const scale = Math.min(inner / photo.width, inner / photo.height);
    const w = Math.max(1, Math.round(photo.width * scale));
    const h = Math.max(1, Math.round(photo.height * scale));
    const x = margin + Math.round((inner - w) / 2);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(photo, x, y, w, h);
    photo.close();
    ditherToInk(context, x, y, w, h);
    y += h + gap;
  }

  // The title, then the SKU small under it.
  context.fillStyle = '#000';
  const titleSize = at(TITLE_TEXT_IN);
  const titleStep = Math.round(titleSize * LINE_PITCH);
  context.font = `700 ${titleSize}px ${FONT}`;
  for (const line of wrapText(context, face.title, inner, TITLE_LINES)) {
    context.fillText(line, margin, y);
    y += titleStep;
  }
  const skuSize = at(SKU_TEXT_IN);
  drawFittedText(context, face.sku, margin, y, inner, skuSize, 400);
  y += skuSize + gap;

  // Notes — a heading, then the operator's text in whatever room is left.
  const notes = face.notes.trim();
  const headingSize = at(NOTES_HEADING_IN);
  const notesSize = at(NOTES_TEXT_IN);
  const notesStep = Math.round(notesSize * LINE_PITCH);
  const room = Math.floor((height - margin - y - Math.round(headingSize * LINE_PITCH)) / notesStep);
  if (notes && room > 0) {
    context.font = `700 ${headingSize}px ${FONT}`;
    context.fillText('Notes', margin, y);
    y += Math.round(headingSize * LINE_PITCH);
    context.font = `400 ${notesSize}px ${FONT}`;
    for (const line of wrapText(context, notes, inner, room)) {
      context.fillText(line, margin, y);
      y += notesStep;
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
