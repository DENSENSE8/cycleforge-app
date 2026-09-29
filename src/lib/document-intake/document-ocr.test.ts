import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentOcrError, documentOcrFailure, documentSourceFromDataUrl } from './document-ocr';

test('camera data URLs become bounded local OCR sources', () => {
  const source = documentSourceFromDataUrl('data:image/jpeg;base64,aGVsbG8=', 2);
  assert.equal(source.bytes.toString('utf8'), 'hello');
  assert.equal(source.fileName, 'paperwork-page-2.jpeg');
  assert.equal(source.mimeType, 'image/jpeg');
});
test('remote URLs are refused at the document-intake boundary', () => {
  assert.throws(
    () => documentSourceFromDataUrl('https://example.com/paperwork.jpg', 1),
    (error) => error instanceof DocumentOcrError && error.code === 'unsupported_source',
  );
});

test('OCR failures preserve a stable downstream status', () => {
  assert.deepEqual(
    documentOcrFailure(new DocumentOcrError('not_configured', 'Local OCR is not configured.')),
    {
      kind: 'document_ocr_failure',
      code: 'not_configured',
      message: 'Local OCR is not configured.',
    },
  );
});
