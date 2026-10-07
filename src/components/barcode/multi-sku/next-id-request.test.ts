/**
 * /api/units/next-id must receive the SKU as stored, never the zero-stripped
 * `normalizeSku` form: `00089-P-1` stripped to `89-P-1` missed its catalog row
 * and toasted "Can't allocate unit id" on testing Pass · Print.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupProductInfo, peekNextUnitId } from './unit-label-api';

function stubFetch(): { bodies: unknown[]; urls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const bodies: unknown[] = [];
  const urls: string[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    urls.push(String(url));
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ ok: true, unitId: 'U-1', gtin: '' }), { status: 200 });
  }) as typeof fetch;
  return { bodies, urls, restore: () => { globalThis.fetch = original; } };
}

test('lookupProductInfo asks for the SKU as typed — zeros kept, qualifier dropped', async () => {
  const { urls, restore } = stubFetch();
  try {
    await lookupProductInfo('00089-P-1');
    await lookupProductInfo('01103:B95');
  } finally {
    restore();
  }
  assert.deepEqual(urls, ['/api/get-title-by-sku?sku=00089-P-1', '/api/get-title-by-sku?sku=01103']);
});

test('peekNextUnitId sends the padded SKU and the catalog hint unchanged', async () => {
  const { bodies, restore } = stubFetch();
  try {
    await peekNextUnitId('00089-P-1', 348);
    await peekNextUnitId('00089-P-1');
  } finally {
    restore();
  }
  assert.deepEqual(bodies, [{ sku: '00089-P-1', sku_catalog_id: 348 }, { sku: '00089-P-1' }]);
});
