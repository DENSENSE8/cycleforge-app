import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * CSV order import resolves a mapped `customer_name` to a real `customers` row —
 * it never parks the buyer in `orders.notes`.
 *
 * The import used to write `notes: "Customer: <name>"`, which made the buyer
 * invisible to every customer-scoped read and put import prose in the column
 * operators type into. `ingestCanonicalOrders` now resolves the name through
 * `resolveCustomersByName` (match-then-create, batched) and sets
 * `orders.customer_id`. Law: `.claude/rules/source-of-truth.md` → Customer
 * identity on ingest.
 *
 * **Why E2E and not a unit test:** the whole change is SQL — a `= ANY($1::text[])`
 * match on a normalized name expression, and a multi-row `VALUES` insert whose
 * placeholder arithmetic is computed in JS. None of that is reachable without a
 * database, and the normalization bug this pins (Postgres one-arg `btrim` strips
 * spaces only, so trimming before collapsing whitespace mints a duplicate
 * customer) is invisible to any test that does not actually run the query.
 *
 * Runs on the QA org (`--project=qa-desktop`), never the dogfood tenant.
 *
 * **Residue:** orders are deleted in `finally`. The buyer name is deliberately
 * STABLE rather than uniquified, because there is no customer-delete endpoint:
 * the first run creates that customer and every run after matches it, so the
 * suite converges on exactly one row instead of leaking one per run. That also
 * means both paths get covered over time — creation once, matching forever
 * after — while the invariants asserted below hold on every run either way.
 *
 * Run: pnpm provision:qa-org && npx playwright test orders-csv-import-customer --project=qa-desktop
 */

/** Stable on purpose — see the residue note above. */
const BUYER = 'QA CSV Buyer';
/** A second pair, likewise stable, for the multi-row-insert case below. */
const BUYER_TWO = 'QA CSV Buyer Two';
const BUYER_THREE = 'QA CSV Buyer Three';

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface OrderDetail {
  id: number;
  order_id: string;
  notes: string | null;
  customer_id: number | null;
  customer_name: string | null;
}

async function importCsv(
  request: APIRequestContext,
  rows: Array<{ Order: string; SKU: string; Qty: string; Customer: string }>,
) {
  const res = await request.post('/api/orders/import-csv', {
    data: {
      rows,
      mapping: {
        order_number: 'Order',
        sku: 'SKU',
        quantity: 'Qty',
        customer_name: 'Customer',
      },
    },
  });
  expect(res.status(), 'csv import').toBe(200);
  return (await res.json()) as { inserted: number; skipped: number; errors: unknown[] };
}

async function lookupOrder(request: APIRequestContext, orderNumber: string): Promise<OrderDetail> {
  const res = await request.get(`/api/orders/lookup/${encodeURIComponent(orderNumber)}`);
  expect(res.status(), `lookup ${orderNumber}`).toBe(200);
  const body = (await res.json()) as { ok: boolean; order: OrderDetail | null };
  expect(body.ok && body.order, `order ${orderNumber} should exist after import`).toBeTruthy();
  return body.order!;
}

test.describe('CSV import — buyer identity', () => {
  test('a mapped customer_name becomes a customer, not a note', async ({ request }) => {
    const run = uniq();
    const a = `E2E-CSV-${run}-A`;
    const b = `E2E-CSV-${run}-B`;
    const c = `E2E-CSV-${run}-C`;
    const created: number[] = [];

    try {
      // ── Batch 1: the same buyer twice, the second spelled with sloppy
      //    whitespace and case — exactly what a hand-maintained CSV carries.
      const first = await importCsv(request, [
        { Order: a, SKU: 'E2E-CSV-SKU', Qty: '1', Customer: BUYER },
        { Order: b, SKU: 'E2E-CSV-SKU', Qty: '2', Customer: '  qa   CSV   buyer ' },
      ]);
      expect(first.errors, 'import should report no row errors').toEqual([]);
      expect(first.inserted, 'both rows insert').toBe(2);

      const orderA = await lookupOrder(request, a);
      const orderB = await lookupOrder(request, b);
      created.push(orderA.id, orderB.id);

      // The buyer landed as a real customer…
      expect(orderA.customer_id, 'order A must carry a resolved customer').not.toBeNull();
      expect(orderA.customer_name, 'the resolved customer round-trips its name').toBe(BUYER);

      // …and NOT as prose in the notes column. This is the regression.
      expect(String(orderA.notes ?? '').trim(), 'orders.notes must stay empty').toBe('');
      expect(String(orderB.notes ?? '').trim(), 'orders.notes must stay empty').toBe('');

      // Whitespace + case variants are the SAME person. If the SQL match key
      // and the JS match key disagree, this is where a duplicate appears.
      expect(orderB.customer_id, 'a sloppy-whitespace variant is the same buyer').toBe(
        orderA.customer_id,
      );

      // ── Batch 2: a separate import must MATCH the customer batch 1 resolved,
      //    not create a second one. This is the cross-import path, which is what
      //    a weekly CSV drop actually exercises.
      const second = await importCsv(request, [
        { Order: c, SKU: 'E2E-CSV-SKU', Qty: '1', Customer: BUYER.toUpperCase() },
      ]);
      expect(second.inserted, 'third row inserts').toBe(1);

      const orderC = await lookupOrder(request, c);
      created.push(orderC.id);
      expect(orderC.customer_id, 'a later import joins the existing customer').toBe(
        orderA.customer_id,
      );
      expect(String(orderC.notes ?? '').trim(), 'orders.notes must stay empty').toBe('');
    } finally {
      if (created.length > 0) {
        await request.post('/api/orders/delete', { data: { orderIds: created } });
      }
    }
  });

  test('two new buyers in one batch each get their own customer', async ({ request }) => {
    // Covers the MULTI-ROW insert specifically. The creating INSERT builds its
    // `VALUES` tuples in JS (`$1..$5`, `$6..$10`, …), and offset arithmetic that
    // is wrong past the first tuple is invisible to any batch that only ever
    // creates one customer — which is what the test above degrades to once its
    // stable buyer exists. Two distinct names in ONE import is the only shape
    // that runs the second tuple.
    const run = uniq();
    const a = `E2E-CSV-${run}-P`;
    const b = `E2E-CSV-${run}-Q`;
    const created: number[] = [];

    try {
      const res = await importCsv(request, [
        { Order: a, SKU: 'E2E-CSV-SKU', Qty: '1', Customer: BUYER_TWO },
        { Order: b, SKU: 'E2E-CSV-SKU', Qty: '1', Customer: BUYER_THREE },
      ]);
      expect(res.inserted, 'both rows insert').toBe(2);

      const orderA = await lookupOrder(request, a);
      const orderB = await lookupOrder(request, b);
      created.push(orderA.id, orderB.id);

      expect(orderA.customer_id, 'first buyer resolved').not.toBeNull();
      expect(orderB.customer_id, 'second buyer resolved').not.toBeNull();
      // Distinct names must NOT collapse — the second tuple's values have to
      // land on the second row, not overwrite or shift into the first.
      expect(orderB.customer_id, 'two names are two customers').not.toBe(orderA.customer_id);
      expect(orderA.customer_name, 'first name round-trips').toBe(BUYER_TWO);
      expect(orderB.customer_name, 'second name round-trips').toBe(BUYER_THREE);
    } finally {
      if (created.length > 0) {
        await request.post('/api/orders/delete', { data: { orderIds: created } });
      }
    }
  });

  test('a CSV with no customer column leaves the buyer unresolved, not invented', async ({
    request,
  }) => {
    // The resolver must be free when unused: an unmapped customer column means
    // no name, which means no customer and no query — never a placeholder row.
    const order = `E2E-CSV-${uniq()}-NOBUYER`;
    let id: number | null = null;
    try {
      const res = await request.post('/api/orders/import-csv', {
        data: {
          rows: [{ Order: order, SKU: 'E2E-CSV-SKU', Qty: '1' }],
          mapping: { order_number: 'Order', sku: 'SKU', quantity: 'Qty' },
        },
      });
      expect(res.status(), 'csv import').toBe(200);
      expect((await res.json()).inserted, 'row inserts').toBe(1);

      const row = await lookupOrder(request, order);
      id = row.id;
      expect(row.customer_id, 'no name → no customer').toBeNull();
      expect(String(row.notes ?? '').trim(), 'and still no note').toBe('');
    } finally {
      if (id) await request.post('/api/orders/delete', { data: { orderIds: [id] } });
    }
  });
});
