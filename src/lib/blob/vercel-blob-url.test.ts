import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isVercelBlobHostname,
  isVercelBlobUrl,
  kitPartDocumentContentPath,
  productManualContentPath,
} from './vercel-blob-url';

test('public store hostnames are recognized', () => {
  assert.equal(isVercelBlobHostname('dxo1iaq12ujzkoor.public.blob.vercel-storage.com'), true);
  assert.equal(
    isVercelBlobUrl(
      'https://dxo1iaq12ujzkoor.public.blob.vercel-storage.com/manuals/a.pdf',
    ),
    true,
  );
});

test('non-public store hostnames are recognized', () => {
  assert.equal(isVercelBlobHostname('abc.blob.vercel-storage.com'), true);
  assert.equal(isVercelBlobHostname('blob.vercel-storage.com'), true);
});

test('foreign hosts are rejected', () => {
  assert.equal(isVercelBlobHostname('evil.example.com'), false);
  assert.equal(isVercelBlobUrl('https://storage.googleapis.com/bucket/x.jpg'), false);
  assert.equal(isVercelBlobUrl('/api/photos/1/content'), false);
  assert.equal(isVercelBlobUrl('not a url'), false);
  assert.equal(isVercelBlobUrl(null), false);
});

test('preview paths are numeric and same-origin', () => {
  assert.equal(productManualContentPath(42), '/api/product-manuals/42/content');
  assert.equal(kitPartDocumentContentPath(7), '/api/sku-kit-parts/7/document');
});
