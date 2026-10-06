/**
 * The uploaded PDF, page by page — no I/O. Reads the PDF once (pdf-lib),
 * classifies every page by its size ({@link classifyPageStock}: 4×6-class →
 * `label`, anything else → `paper`) and cuts a page out as its own one-page
 * PDF. A mixed PDF splits by page; the writer (`uploadLabelBatch`) routes each
 * page by its stock.
 */
import { PDFDocument } from 'pdf-lib';
import { classifyPageStock, type PageStock } from '@/lib/label-prints/print-file-contracts';
import { MAX_LABEL_BATCH_BYTES, MAX_LABEL_BATCH_PAGES } from './contracts';

export class LabelBatchError extends Error {
  constructor(readonly code: 'INVALID_PDF' | 'PAYLOAD_TOO_LARGE', message: string) {
    super(message);
    this.name = 'LabelBatchError';
  }
}

export interface UploadPdf {
  source: PDFDocument;
  /** Page order (index 0 = page 1). */
  stocks: PageStock[];
}

/** Read and bound one upload; every page's stock from its MediaBox size. */
export async function readUploadPdf(bytes: Uint8Array): Promise<UploadPdf> {
  if (!bytes.length || bytes.length > MAX_LABEL_BATCH_BYTES) throw new LabelBatchError('PAYLOAD_TOO_LARGE', 'PDF exceeds the permitted size.');
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new LabelBatchError('INVALID_PDF', 'The uploaded file is not a PDF.');
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    throw new LabelBatchError('INVALID_PDF', 'The PDF could not be read (damaged or encrypted).');
  }
  const pageCount = source.getPageCount();
  if (pageCount < 1) throw new LabelBatchError('INVALID_PDF', 'The PDF has no pages.');
  if (pageCount > MAX_LABEL_BATCH_PAGES) throw new LabelBatchError('PAYLOAD_TOO_LARGE', `A PDF may carry at most ${MAX_LABEL_BATCH_PAGES} pages.`);
  const stocks = source.getPages().map((page) => {
    const { width, height } = page.getSize();
    return classifyPageStock(width, height);
  });
  return { source, stocks };
}

/** Page `index` (0-based) as its own one-page PDF. Deterministic bytes: the same page always hashes the same. */
export async function extractPdfPage(source: PDFDocument, index: number): Promise<Buffer> {
  const page = await PDFDocument.create({ updateMetadata: false });
  const [copied] = await page.copyPages(source, [index]);
  page.addPage(copied!);
  return Buffer.from(await page.save());
}
