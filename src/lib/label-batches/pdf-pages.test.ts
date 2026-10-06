import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { extractPdfPage, LabelBatchError, readUploadPdf } from './pdf-pages';

async function pdfOf(sizes: Array<[number, number]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const size of sizes) doc.addPage(size);
  return doc.save();
}

test('a mixed PDF splits by page: 4×6 → label, Letter → paper, in page order', async () => {
  const { source, stocks } = await readUploadPdf(await pdfOf([[288, 432], [612, 792], [432, 288]]));
  assert.deepEqual(stocks, ['label', 'paper', 'label']);
  const page = await PDFDocument.load(await extractPdfPage(source, 1));
  assert.equal(page.getPageCount(), 1);
  assert.deepEqual(page.getPage(0).getSize(), { width: 612, height: 792 });
});

test('the same page always cuts to the same bytes', async () => {
  const { source } = await readUploadPdf(await pdfOf([[288, 432], [612, 792]]));
  assert.deepEqual(await extractPdfPage(source, 0), await extractPdfPage(source, 0));
});

test('not a PDF is rejected before parsing', async () => {
  await assert.rejects(readUploadPdf(new TextEncoder().encode('hello world')), (error) => error instanceof LabelBatchError && error.code === 'INVALID_PDF');
});
