import test from 'node:test';
import assert from 'node:assert/strict';

import {
  centsToSaleAmount,
  setOrderPrice,
  type OrderPriceLine,
  type SetOrderPriceDeps,
} from './set-order-price';

const ORG = '00000000-0000-0000-0000-000000000001' as never;

type FoundLine = OrderPriceLine & { orderNumber: string | null };

interface Captured {
  found: Array<{ organizationId: unknown; orderId: number | null; orderNumber: string | null }>;
  written: Array<{ organizationId: unknown; orderId: number; saleAmount: string | null; currency: string | null }>;
}

function line(id: number, saleAmount: string | null, over: Partial<FoundLine> = {}): FoundLine {
  return {
    id,
    orderNumber: '12-34567-89012',
    sku: `SKU-${id}`,
    productTitle: `Widget ${id}`,
    saleAmount,
    currency: 'USD',
    ...over,
  };
}

function fakes(lines: FoundLine[]) {
  const cap: Captured = { found: [], written: [] };
  const deps: SetOrderPriceDeps = {
    findLines: async (args) => {
      cap.found.push(args);
      return lines;
    },
    writeSaleAmount: async (args) => {
      cap.written.push(args);
      const target = lines.find((l) => l.id === args.orderId);
      return {
        id: args.orderId,
        sku: target?.sku ?? null,
        productTitle: target?.productTitle ?? null,
        saleAmount: args.saleAmount,
        currency: args.currency ?? target?.currency ?? null,
      };
    },
  };
  return { deps, cap };
}

test('single-line order number: writes the decimal amount and reports before/after', async () => {
  const { deps, cap } = fakes([line(4101, null)]);

  const result = await setOrderPrice(
    { organizationId: ORG, orderNumber: '12-34567-89012', priceCents: 1900, currency: 'usd' },
    deps,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result, {
    ok: true,
    status: 200,
    orderId: 4101,
    orderNumber: '12-34567-89012',
    before: { saleAmount: null, currency: 'USD' },
    after: { saleAmount: '19.00', currency: 'USD' },
  });
  assert.equal(cap.written.length, 1);
  assert.deepEqual(cap.written[0], {
    organizationId: ORG,
    orderId: 4101,
    saleAmount: '19.00',
    currency: 'USD',
  });
  // Org scope is threaded to the read too, never defaulted.
  assert.equal(cap.found[0].organizationId, ORG);
  assert.equal(cap.found[0].orderId, null);
});

test('multi-line order number: refuses with 409, returns candidates, writes NOTHING', async () => {
  const { deps, cap } = fakes([line(4101, '19.00'), line(4102, null, { sku: 'SKU-B' })]);

  const result = await setOrderPrice(
    { organizationId: ORG, orderNumber: '12-34567-89012', priceCents: 1900 },
    deps,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(result.reason, 'ambiguous_order_number');
  assert.deepEqual(result.reason === 'ambiguous_order_number' ? result.lines : null, [
    { id: 4101, sku: 'SKU-4101', productTitle: 'Widget 4101', saleAmount: '19.00', currency: 'USD' },
    { id: 4102, sku: 'SKU-B', productTitle: 'Widget 4102', saleAmount: null, currency: 'USD' },
  ]);
  // The whole point: one amount on N lines would multiply the order's revenue.
  assert.equal(cap.written.length, 0);
});

test('explicit orderId targets exactly that line', async () => {
  const { deps, cap } = fakes([line(4102, '19.00')]);

  const result = await setOrderPrice({ organizationId: ORG, orderId: 4102, priceCents: 5 }, deps);

  assert.equal(result.ok, true);
  assert.equal(cap.found[0].orderId, 4102);
  assert.equal(cap.found[0].orderNumber, null);
  assert.equal(cap.written[0].saleAmount, '0.05');
});

test('priceCents null clears the amount and leaves currency untouched', async () => {
  const { deps, cap } = fakes([line(4101, '19.00')]);

  const result = await setOrderPrice({ organizationId: ORG, orderId: 4101, priceCents: null }, deps);

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.after : null, { saleAmount: null, currency: 'USD' });
  assert.equal(cap.written[0].saleAmount, null);
  assert.equal(cap.written[0].currency, null);
});

test('explicit 0 is accepted — a free replacement order really sold for nothing', async () => {
  const { deps, cap } = fakes([line(4101, '19.00')]);

  const result = await setOrderPrice({ organizationId: ORG, orderId: 4101, priceCents: 0 }, deps);

  assert.equal(result.ok, true);
  assert.equal(cap.written[0].saleAmount, '0.00');
});

test('negative and non-integer cents are rejected before any write', async () => {
  for (const priceCents of [-1, -1900, 19.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { deps, cap } = fakes([line(4101, null)]);
    const result = await setOrderPrice({ organizationId: ORG, orderId: 4101, priceCents }, deps);

    assert.equal(result.ok, false, `${priceCents} should be rejected`);
    assert.equal(result.ok ? null : result.status, 400);
    assert.equal(result.ok ? null : result.reason, 'invalid_price');
    assert.equal(cap.written.length, 0);
    assert.equal(cap.found.length, 0, 'validation short-circuits before the read');
  }
});

test('neither or both identities is a 400 — there is no defensible precedence', async () => {
  const { deps, cap } = fakes([line(4101, null)]);

  const neither = await setOrderPrice({ organizationId: ORG, priceCents: 1900 }, deps);
  const both = await setOrderPrice(
    { organizationId: ORG, orderId: 4101, orderNumber: '12-34567-89012', priceCents: 1900 },
    deps,
  );

  for (const result of [neither, both]) {
    assert.equal(result.ok, false);
    assert.equal(result.ok ? null : result.reason, 'identity_required');
  }
  assert.equal(cap.written.length, 0);
});

test('a blank order number is not an identity', async () => {
  const { deps, cap } = fakes([line(4101, null)]);

  const result = await setOrderPrice({ organizationId: ORG, orderNumber: '   ', priceCents: 1900 }, deps);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.reason, 'identity_required');
  assert.equal(cap.found.length, 0);
});

test('no matching line is a 404, not a silent success', async () => {
  const { deps, cap } = fakes([]);

  const result = await setOrderPrice({ organizationId: ORG, orderId: 999999, priceCents: 1900 }, deps);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.status, 404);
  assert.equal(cap.written.length, 0);
});

test('centsToSaleAmount: exact 2-decimal strings, no float rounding', () => {
  assert.equal(centsToSaleAmount(1900), '19.00');
  assert.equal(centsToSaleAmount(5), '0.05');
  assert.equal(centsToSaleAmount(0), '0.00');
  assert.equal(centsToSaleAmount(99), '0.99');
  assert.equal(centsToSaleAmount(100), '1.00');
  assert.equal(centsToSaleAmount(123456789), '1234567.89');
});
