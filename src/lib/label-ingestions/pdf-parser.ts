import 'server-only';
import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';
import { LABEL_PARSER_VERSION, MAX_LABEL_EXTRACTED_TEXT_CHARS, MAX_LABEL_PARSE_MS, MAX_LABEL_PDF_BYTES, MAX_LABEL_PDF_PAGES } from './contracts';
import { decodeLabelRaster, type LabelRaster } from './label-barcodes';
import { layoutRuns, readShipToName, readTrackingFromRuns, readTrackingValue, type LabelTextItem, type TrackingRead } from './label-text-layout';
import type { ParsedLabelEvidence } from './types';

export class LabelPdfParseError extends Error {
  constructor(readonly code: 'INVALID_PDF' | 'PDF_LIMIT_EXCEEDED' | 'PARSE_FAILED', message: string) {
    super(message);
    this.name = 'LabelPdfParseError';
  }
}

interface PdfPageText {
  getTextContent(): Promise<{ items: Array<{ str?: unknown; transform?: unknown; width?: unknown }> }>;
  /** pdf.js operator list + object store — present on real pages, absent on test fakes. */
  getOperatorList?(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs?: { get(id: string, callback: (data: unknown) => void): void };
  commonObjs?: { get(id: string, callback: (data: unknown) => void): void };
}
interface PdfDocument { numPages: number; getPage(page: number): Promise<PdfPageText>; destroy?(): void; }
type PdfLoader = (bytes: Uint8Array) => Promise<PdfDocument>;

/** pdf.js `OPS.paintImageXObject` — stable across pdf.js majors. */
const PAINT_IMAGE_XOBJECT = 85;

async function bounded<T>(work: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<T>((_, reject) => { timeout = setTimeout(() => reject(new LabelPdfParseError('PDF_LIMIT_EXCEEDED', 'PDF parsing exceeded the time limit.')), MAX_LABEL_PARSE_MS); })]);
  } finally { clearTimeout(timeout); }
}

async function loadPdfDocument(bytes: Uint8Array): Promise<PdfDocument> {
  try {
    // The server must use pdf.js's Node-compatible build. The browser build
    // needs DOM worker primitives and would turn valid uploads into parse
    // failures under the hosted route runtime.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // pdf.js transfers/detaches its input buffer while loading. Copy a Node
    // Buffer/view into a plain Uint8Array so the route's upload bytes stay
    // intact for later staging and parsing is portable across runtimes.
    // No OffscreenCanvas / ImageDecoder on the server: images decode to raw
    // pixel data the barcode reader can use.
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isOffscreenCanvasSupported: false, isImageDecoderSupported: false, verbosity: 0 });
    return await task.promise as unknown as PdfDocument;
  } catch {
    throw new LabelPdfParseError('INVALID_PDF', 'The uploaded file is not a readable PDF.');
  }
}

function labelled(text: string, label: string): string | null {
  const found = new RegExp(`(?:^|\\n|\\s)${label}\\s*[:#]\\s*([^\\n\\r]{1,160}?)(?=\\s+(?:CycleForge Reference|Marketplace Order ID|Tracking(?: Number)?|Marketplace|Account)\\s*[:#]|\\n|$)`, 'im').exec(text)?.[1]?.trim();
  return found && /^[A-Za-z0-9._:/ -]+$/.test(found) ? found : null;
}

/** The tracking number printed as a barcode on the page's embedded rasters (image-only labels). */
async function trackingFromPageImages(page: PdfPageText): Promise<TrackingRead | null> {
  if (!page.getOperatorList || !page.objs) return null;
  const ops = await page.getOperatorList();
  for (let index = 0; index < ops.fnArray.length; index += 1) {
    if (ops.fnArray[index] !== PAINT_IMAGE_XOBJECT) continue;
    const id = String(ops.argsArray[index]?.[0] ?? '');
    const store = id.startsWith('g_') ? page.commonObjs : page.objs;
    if (!id || !store) continue;
    const raster = await new Promise<unknown>((resolve) => store.get(id, resolve));
    if (!raster || typeof raster !== 'object' || !('data' in raster)) continue;
    for (const value of decodeLabelRaster(raster as LabelRaster)) {
      const read = readTrackingValue(value, true);
      if (read) return read;
    }
  }
  return null;
}

/**
 * Evidence off one label PDF: explicitly labelled machine identity
 * (CycleForge reference, marketplace order, account), the tracking number
 * (labelled, else read by layout, else decoded from the barcode of an
 * image-only label), and the ship-to name read by layout. Raw text never
 * leaves this function.
 */
export async function parseLabelPdf(bytes: Uint8Array, loader: PdfLoader = loadPdfDocument): Promise<ParsedLabelEvidence> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_LABEL_PDF_BYTES) throw new LabelPdfParseError('PDF_LIMIT_EXCEEDED', 'PDF exceeds the permitted size.');
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new LabelPdfParseError('INVALID_PDF', 'The uploaded file is not a PDF.');
  const pdf = await bounded(loader(bytes));
  try {
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > MAX_LABEL_PDF_PAGES) throw new LabelPdfParseError('PDF_LIMIT_EXCEEDED', 'PDF exceeds the permitted page count.');
    let text = '';
    const items: LabelTextItem[] = [];
    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await bounded(pdf.getPage(pageNumber));
      pages.push(page);
      const content = await bounded(page.getTextContent());
      text += content.items.map((item) => typeof item.str === 'string' ? item.str : '').join(' ') + '\n';
      if (text.length > MAX_LABEL_EXTRACTED_TEXT_CHARS) throw new LabelPdfParseError('PDF_LIMIT_EXCEEDED', 'PDF contains too much text.');
      for (const item of content.items) {
        if (typeof item.str === 'string' && Array.isArray(item.transform)) items.push({ str: item.str, transform: item.transform as number[], width: typeof item.width === 'number' ? item.width : undefined });
      }
    }
    const runs = layoutRuns(items);
    const labelledTracking = labelled(text, 'Tracking(?: Number)?');
    let tracking: TrackingRead | null = null;
    if (labelledTracking) {
      const normalized = normalizeTrackingNumber(labelledTracking);
      tracking = { raw: labelledTracking, normalized, carrier: detectCarrier(normalized) ?? '' };
    }
    tracking ??= readTrackingFromRuns(runs);
    for (const page of pages) {
      if (tracking) break;
      tracking = await bounded(trackingFromPageImages(page));
    }
    return {
      parserVersion: LABEL_PARSER_VERSION,
      cycleforgeReference: labelled(text, 'CycleForge Reference'),
      marketplaceOrderId: labelled(text, 'Marketplace Order ID'),
      accountSource: labelled(text, '(?:Marketplace|Account)'),
      trackingNumberRaw: tracking?.raw ?? null,
      trackingNumberNormalized: tracking?.normalized ?? null,
      carrier: tracking?.carrier || null,
      multiPackageEvidence: /(?:package|parcel)\s+\d+\s*(?:of|\/)\s*\d+/i.test(text),
      shipToName: readShipToName(runs),
    };
  } catch (error) {
    if (error instanceof LabelPdfParseError) throw error;
    throw new LabelPdfParseError('PARSE_FAILED', 'The PDF could not be parsed.');
  } finally { pdf.destroy?.(); }
}
