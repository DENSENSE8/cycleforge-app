import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MobileOrderSubmissionError,
  submitMobileOrder,
  type MobileOrderSubmissionInput,
} from './mobile-order-submission';
import { emptyCanonicalOrderIntake } from './canonical-order-intake';

function input(overrides: Partial<MobileOrderSubmissionInput> = {}): MobileOrderSubmissionInput {
  return {
    draft: {
      ...emptyCanonicalOrderIntake('manual'),
      orderNumber: 'EBAY-1001',
      platformChosen: 'ebay',
      productTitle: 'Widget',
    },
    saleAmount: '12.50',
    currency: 'USD',
    isUrgent: false,
    clientEventId: 'client-event-1',
    files: {},
    ...overrides,
  };
}

test('reuses the same idempotency key when the create response is lost', async () => {
  let attempts = 0;
  const keys: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    attempts += 1;
    keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
    if (attempts === 1) throw new Error('response lost after commit');
    return new Response(JSON.stringify({ success: true, order: { id: 22, order_id: 'EBAY-1001' } }));
  };

  await assert.rejects(
    submitMobileOrder(input(), { fetcher }),
    (error: MobileOrderSubmissionError) => error.stage === 'create' && error.orderId === null,
  );
  const result = await submitMobileOrder(input(), { fetcher });

  assert.deepEqual(result, { orderId: 22, orderNumber: 'EBAY-1001' });
  assert.deepEqual(keys, ['client-event-1', 'client-event-1']);
});

test('returns the durable order id when a later document upload fails', async () => {
  const file = new File(['pdf'], 'label.pdf', { type: 'application/pdf' });
  const fetcher: typeof fetch = async (url) => {
    if (String(url).endsWith('/api/orders/add')) {
      return new Response(JSON.stringify({ success: true, order: { id: 31, order_id: 'EBAY-1001' } }));
    }
    return new Response(JSON.stringify({ success: false, error: 'storage unavailable' }), { status: 503 });
  };

  await assert.rejects(
    submitMobileOrder(input({ files: { shipping_label: file } }), { fetcher }),
    (error: MobileOrderSubmissionError) => error.stage === 'document:shipping_label' && error.orderId === 31,
  );
});

test('completes canonical create, parcel, and document attachment in order', async () => {
  const calls: string[] = [];
  const file = new File(['pdf'], 'label.pdf', { type: 'application/pdf' });
  const fetcher: typeof fetch = async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
    if (String(url).endsWith('/api/orders/add')) {
      return new Response(JSON.stringify({ success: true, order: { id: 42, order_id: 'EBAY-1001' } }));
    }
    return new Response(JSON.stringify({ success: true }));
  };

  const result = await submitMobileOrder(input({
    draft: {
      ...input().draft,
      itemNumber: 'ITEM-1',
      weightOz: 8,
      dimL: 10,
      dimW: 6,
      dimH: 2,
    },
    files: { shipping_label: file },
  }), { fetcher });

  assert.equal(result.orderId, 42);
  assert.equal(calls[0], 'POST /api/orders/add');
  assert.equal(calls[1], 'POST /api/orders/set-item-number');
  assert.equal(calls[2], 'POST /api/orders/42/cage-release');
  assert.equal(calls[3], 'POST /api/orders/42/documents/upload');
});
