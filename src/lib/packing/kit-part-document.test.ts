import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitPartDocument } from './kit-part-document';

test('a part with no document columns has no document', () => {
  assert.equal(kitPartDocument({ component_name: 'Power cable' }), null);
});

test('a blank or whitespace url is absence, not an empty viewer', () => {
  // The failure this exists to prevent: a named insert that opens to nothing.
  assert.equal(kitPartDocument({ document_url: '' }), null);
  assert.equal(kitPartDocument({ document_url: '   ' }), null);
  assert.equal(kitPartDocument({ document_url: null }), null);
  assert.equal(
    kitPartDocument({ document_url: '  ', document_title: 'Warranty card' }),
    null,
    'a title cannot resurrect a document with no url',
  );
});

test('the url is trimmed and the title falls back to the part name', () => {
  const doc = kitPartDocument({
    component_name: 'Warranty card',
    document_url: '  https://blob.example/warranty.pdf  ',
  });
  assert.deepEqual(doc, { url: 'https://blob.example/warranty.pdf', title: 'Warranty card' });
});

test('an explicit document_title wins over the part name', () => {
  const doc = kitPartDocument({
    component_name: 'Insert',
    document_title: '2026 warranty terms',
    document_url: 'https://blob.example/w.pdf',
  });
  assert.equal(doc?.title, '2026 warranty terms');
});

test('the DTO shape resolves identically to the DB row shape', () => {
  // Structural on purpose — `name` (DTO) and `component_name` (row) are the
  // same fact, and a caller must not have to know which one it holds.
  assert.equal(
    kitPartDocument({ name: 'Quick start', document_url: 'https://b/x.pdf' })?.title,
    'Quick start',
  );
});

test('a recognized mime is carried; anything else defers to url sniffing', () => {
  assert.equal(
    kitPartDocument({ document_url: 'https://b/x', document_mime: 'pdf' })?.mime,
    'pdf',
  );
  assert.equal(
    kitPartDocument({ document_url: 'https://b/x', document_mime: 'IMAGE' })?.mime,
    'image',
    'stored mime is matched case-insensitively',
  );
  for (const bogus of ['unknown', 'application/pdf', 'docx', '', null]) {
    assert.equal(
      kitPartDocument({ document_url: 'https://b/x.pdf', document_mime: bogus })?.mime,
      undefined,
      `${String(bogus)} must not reach DocumentPreviewFrame as a hint`,
    );
  }
});

test('a document with no usable name is still openable', () => {
  assert.equal(kitPartDocument({ document_url: 'https://b/x.pdf' })?.title, 'Insert');
});
