import test from 'node:test';
import assert from 'node:assert/strict';
import { documentNetworkUrl } from './document-network-url';

test('drops the PDF viewer hash and keeps query params', () => {
  assert.equal(
    documentNetworkUrl('/api/product-manuals/9/content?v=1#toolbar=1&navpanes=0'),
    '/api/product-manuals/9/content?v=1',
  );
  assert.equal(documentNetworkUrl('/api/sku-kit-parts/3/document'), '/api/sku-kit-parts/3/document');
});
