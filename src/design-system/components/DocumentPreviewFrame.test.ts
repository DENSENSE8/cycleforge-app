import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDocumentPreviewMime } from './document-preview-mime';

describe('resolveDocumentPreviewMime', () => {
  it('honors explicit pdf / image hints', () => {
    assert.equal(resolveDocumentPreviewMime(null, 'pdf'), 'pdf');
    assert.equal(resolveDocumentPreviewMime('https://x/a.bin', 'image'), 'image');
  });

  it('detects pdf and image from URL', () => {
    assert.equal(resolveDocumentPreviewMime('https://nas.example/label.pdf'), 'pdf');
    assert.equal(resolveDocumentPreviewMime('https://nas.example/slip.PDF?x=1'), 'pdf');
    assert.equal(resolveDocumentPreviewMime('https://nas.example/photo.png'), 'image');
  });

  it('treats document content routes as pdf', () => {
    assert.equal(resolveDocumentPreviewMime('/api/documents/42/content'), 'pdf');
  });
});
