/**
 * Unit tests for the shared identifier commit helper.
 * Run: npx tsx --test src/lib/search/commit-identifier-find.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import {
  commitIdentifierFind,
  hrefForPreviewHit,
  type CommitIdentifierFindResult,
} from './commit-identifier-find';
import { searchOrderResolveQueryKey } from './search-order-resolve-query';
import type { ResolvedSearchOrder } from './resolve-search-order';

const okOrder = {
  id: 42,
  order_id: '05-14897-15602',
  product_title: 'Bose Wave',
  sku: 'WAVE-1',
  condition: 'USED_GOOD',
  account_source: 'ebay',
  shipping_tracking_number: '1Z999AA10123456784',
  tracking_numbers: ['1Z999AA10123456784'],
  serial_number: 'SN42',
};

test('hrefForPreviewHit: orders use feedback sel href', () => {
  assert.equal(
    hrefForPreviewHit({ entityType: 'order', id: 7, href: '/shipping/orders?x=1' }),
    '/search?sel=order:7',
  );
});

test('hrefForPreviewHit: non-orders keep desktop hit.href', () => {
  assert.equal(
    hrefForPreviewHit({ entityType: 'unit', id: 3, href: '/inventory/units?unit=3' }),
    '/inventory/units?unit=3',
  );
});

test('hrefForPreviewHit: never returns a mobile Digital Link', () => {
  assert.equal(
    hrefForPreviewHit({ entityType: 'receiving', id: 99, href: '/m/r/99' }),
    '/search?sel=receiving:99',
  );
});

test('commitIdentifierFind: ok → navigate + cache seed', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/orders/lookup/')) {
      return new Response(JSON.stringify({ order: okOrder }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // fetchOrderByNumericId after lookup: dashboard miss, then single-order hit.
    if (url.includes('/api/orders?')) {
      return new Response(JSON.stringify({ orders: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (/\/api\/orders\/42(?:\?|$)/.test(url)) {
      return new Response(JSON.stringify({ order: okOrder }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  const qc = new QueryClient();
  const token = '1Z999AA10123456784';
  const result: CommitIdentifierFindResult = await commitIdentifierFind(qc, token);
  assert.equal(result.kind, 'navigate');
  if (result.kind !== 'navigate') return;
  assert.equal(result.href, '/search?sel=order:42');
  assert.equal(result.orderId, 42);
  const cached = qc.getQueryData<ResolvedSearchOrder>(searchOrderResolveQueryKey(token));
  assert.equal(cached?.status, 'ok');
});

test('commitIdentifierFind: miss → stay + cache seed', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({}), { status: 404 })) as typeof fetch;

  const qc = new QueryClient();
  const token = 'ZZZNOMATCH999';
  const result = await commitIdentifierFind(qc, token);
  assert.equal(result.kind, 'stay');
  const cached = qc.getQueryData<ResolvedSearchOrder>(searchOrderResolveQueryKey(token));
  assert.ok(cached);
  assert.notEqual(cached?.status, 'ok');
});
