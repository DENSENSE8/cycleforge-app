import 'server-only';
import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';
import { LABEL_PARSER_VERSION, MAX_LABEL_EXTRACTED_TEXT_CHARS, MAX_LABEL_PARSE_MS, MAX_LABEL_PDF_BYTES, MAX_LABEL_PDF_PAGES } from './contracts';
import type { ParsedLabelEvidence } from './types';

export class LabelPdfParseError extends Error {
  constructor(readonly code: 'INVALID_PDF' | 'PDF_LIMIT_EXCEEDED' | 'PARSE_FAILED', message: string) {
    super(message);
    this.name = 'LabelPdfParseError';
  }
}

export interface PdfPageText { getTextContent(): Promise<{ items: Array<{ str?: unknown }> }>; }
export interface PdfDocument { numPages: number; getPage(page: number): Promise<PdfPageText>; destroy?(): void; }
export type PdfLoader = (bytes: Uint8Array) => Promise<PdfDocument>;

async function bounded<T>(work: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<T>((_, reject) => { timeout = setTimeout(() => reject(new LabelPdfParseError('PDF_LIMIT_EXCEEDED', 'PDF parsing exceeded the time limit.')), MAX_LABEL_PARSE_MS); })]);
  } finally { if (timeout) clearTimeout(timeout); }
}

export async function loadPdfDocument(bytes: Uint8Array): Promise<PdfDocument> {
  try {
    // The server must use pdf.js's Node-compatible build. The browser build
    // needs DOM worker primitives and would turn valid uploads into parse
    // failures under the hosted route runtime.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // pdf.js transfers/detaches its input buffer while loading. Copy a Node
    // Buffer/view into a plain Uint8Array so the route's upload bytes stay
    // intact for later staging and parsing is portable across runtimes.
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
    return await task.promise as unknown as PdfDocument;
  } catch {
    throw new LabelPdfParseError('INVALID_PDF', 'The uploaded file is not a readable PDF.');
  }
}

function labelled(text: string, label: string): string | null {
  const found = new RegExp(`(?:^|\\n|\\s)${label}\\s*[:#]\\s*([^\\n\\r]{1,160}?)(?=\\s+(?:CycleForge Reference|Marketplace Order ID|Tracking(?: Number)?|Marketplace|Account)\\s*[:#]|\\n|$)`, 'im').exec(text)?.[1]?.trim();
  return found && /^[A-Za-z0-9._:/ -]+$/.test(found) ? found : null;
}

/** Extracts only explicitly-labelled machine identity; it is never an order matching algorithm. */
export async function parseLabelPdf(bytes: Uint8Array, loader: PdfLoader = loadPdfDocument): Promise<ParsedLabelEvidence> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_LABEL_PDF_BYTES) throw new LabelPdfParseError('PDF_LIMIT_EXCEEDED', 'PDF exceeds the permitted size.');
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new LabelPdfParseError('INVALID_PDF', 'The uploaded file is not a PDF.');
  const pdf = await bounded(loader(bytes));
  try {
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > MAX_LABEL_PDF_PAGES) throw new LabelPdfParseError('PDF_LIMIT_EXCEEDED', 'PDF exceeds the permitted page count.');
    let text = '';
    for (let page = 1; page <= pdf.numPages; page += 1) {
      const content = await bounded(pdf.getPage(page).then((entry) => entry.getTextContent()));
      text += content.items.map((item) => typeof item.str === 'string' ? item.str : '').join(' ') + '\n';
      if (text.length > MAX_LABEL_EXTRACTED_TEXT_CHARS) throw new LabelPdfParseError('PDF_LIMIT_EXCEEDED', 'PDF contains too much text.');
    }
    const rawTracking = labelled(text, 'Tracking(?: Number)?');
    const normalized = rawTracking ? normalizeTrackingNumber(rawTracking) : null;
    const carrier = normalized ? detectCarrier(normalized) : null;
    return { parserVersion: LABEL_PARSER_VERSION, cycleforgeReference: labelled(text, 'CycleForge Reference'), marketplaceOrderId: labelled(text, 'Marketplace Order ID'), accountSource: labelled(text, '(?:Marketplace|Account)'), trackingNumberRaw: rawTracking, trackingNumberNormalized: normalized, carrier, multiPackageEvidence: /(?:package|parcel)\s+\d+\s*(?:of|\/)\s*\d+/i.test(text) };
  } catch (error) {
    if (error instanceof LabelPdfParseError) throw error;
    throw new LabelPdfParseError('PARSE_FAILED', 'The PDF could not be parsed.');
  } finally { pdf.destroy?.(); }
}
