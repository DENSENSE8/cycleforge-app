import test from 'node:test';
import assert from 'node:assert/strict';
import { relinkReceivingPo, type RelinkDeps, type TxClient } from '@/lib/receiving/relink-po';

interface Captured {
  text: string;
  params: unknown[];
}

/** DB-free fakes: a client that records queries + answers the existence probes. */
function fakes(cartonExists = true, lineExists = true) {
  const queries: Captured[] = [];
  const recomputeCalls: number[] = [];
  const client: TxClient = {
    query: async (text: string, params: unknown[] = []) => {
      queries.push({ text, params });
      if (/SELECT id\s+FROM receiving_carton\b/.test(text)) {
        return cartonExists
          ? { rows: [{ id: params[0] }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      // Line-membership probe (scope 'line' | 'both').
      if (/SELECT id FROM receiving_line\b/.test(text)) {
        return lineExists
          ? { rows: [{ id: params[0] }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const deps: RelinkDeps = {
    recompute: async (id) => {
      recomputeCalls.push(id);
    },
    runTx: async (_orgId, fn) => fn(client),
  };
  return { deps, queries, recomputeCalls };
}

test('relink scope "both" rewrites the line, the carton header, and recomputes', async () => {
  const { deps, queries, recomputeCalls } = fakes();

  const res = await relinkReceivingPo(
    {
      receivingId: 5,
      lineId: 9,
      scope: 'both',
      zohoPurchaseorderId: 'PO123',
      zohoPurchaseorderNumber: '6000',
    },
    'org-1',
    deps,
  );

  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.equal(res.poId, 'PO123');
  assert.equal(res.linesUpdated, 1);

  // Line membership validated against the carton, then the zoho identity lands
  // on receiving_line_zoho (W3 writer inversion — never the spine).
  const probe = queries.find((q) => /SELECT id FROM receiving_line\b/.test(q.text));
  assert.ok(probe, 'expected the line-membership probe');
  assert.deepEqual(probe!.params, [9, 5, 'org-1']);
  const rzUpsert = queries.find((q) => /INSERT INTO receiving_line_zoho/.test(q.text));
  assert.ok(rzUpsert, 'expected a receiving_line_zoho upsert');
  assert.deepEqual(rzUpsert!.params, [9, 'org-1', 'PO123', '6000', null]);
  assert.ok(/zoho_purchaseorder_number_norm/.test(rzUpsert!.text), 'norm maintained with the number');
  // No SKU correction supplied → no spine UPDATE at all.
  assert.ok(!queries.some((q) => /UPDATE receiving_line\b/.test(q.text)), 'no spine write of moved zoho columns');

  // Carton header rewrite flips source to zoho_po (explicit override of upgrade-only).
  const cartonUpdate = queries.find(
    (q) => /UPDATE receiving_carton\b/.test(q.text) && /source = 'zoho_po'/.test(q.text),
  );
  assert.ok(cartonUpdate, 'expected a receiving header UPDATE with source=zoho_po');
  assert.ok(cartonUpdate!.params.includes('PO123'));

  // Carton source link re-derived for this carton.
  assert.deepEqual(recomputeCalls, [5]);
});

test('relink scope "carton" rewrites every line and does NOT need a lineId', async () => {
  const { deps, queries } = fakes();

  const res = await relinkReceivingPo(
    { receivingId: 7, scope: 'carton', zohoPurchaseorderId: 'PO9', zohoPurchaseorderNumber: '777' },
    'org-1',
    deps,
  );

  assert.equal(res.ok, true);
  // Carton-scope rewrite upserts rz for every line of the carton (INSERT..SELECT
  // keyed on receiving_id), never touching the spine zoho columns.
  const rzUpsert = queries.find((q) => /INSERT INTO receiving_line_zoho/.test(q.text));
  assert.ok(rzUpsert, 'expected a receiving_line_zoho upsert');
  assert.ok(/FROM receiving_line rl/.test(rzUpsert!.text));
  assert.ok(/rl\.receiving_id = \$3/.test(rzUpsert!.text));
  assert.deepEqual(rzUpsert!.params, ['PO9', '777', 7, 'org-1']);
  assert.ok(!queries.some((q) => /UPDATE receiving_line\b/.test(q.text)), 'no spine write of moved zoho columns');
});

test('relink returns 404 when the carton is missing (no writes)', async () => {
  const { deps, queries, recomputeCalls } = fakes(false);

  const res = await relinkReceivingPo(
    { receivingId: 1, scope: 'carton', zohoPurchaseorderId: 'X' },
    'org-1',
    deps,
  );

  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
  // Only the existence probe ran — no UPDATE, no recompute.
  assert.ok(!queries.some((q) => /UPDATE/.test(q.text)));
  assert.deepEqual(recomputeCalls, []);
});

test('SKU correction stays on the spine; zoho_item_id rides the rz upsert', async () => {
  const { deps, queries } = fakes();

  await relinkReceivingPo(
    {
      receivingId: 3,
      lineId: 4,
      scope: 'both',
      zohoPurchaseorderId: 'PO5',
      sku: 'ABC-123',
      zohoItemId: 'zi-99',
    },
    'org-1',
    deps,
  );

  // SKU is a spine-staying column — a narrow UPDATE carries only the sku.
  const skuUpdate = queries.find((q) => /UPDATE receiving_line SET sku/.test(q.text));
  assert.ok(skuUpdate, 'expected the sku-only spine UPDATE');
  assert.deepEqual(skuUpdate!.params, ['ABC-123', 4, 'org-1']);
  assert.ok(!/zoho_/.test(skuUpdate!.text), 'spine UPDATE must not touch zoho columns');
  // zoho_item_id lands on rz, overwrite-when-provided.
  const rzUpsert = queries.find((q) => /INSERT INTO receiving_line_zoho/.test(q.text));
  assert.ok(rzUpsert);
  assert.ok(rzUpsert!.params.includes('zi-99'));
  assert.ok(/COALESCE\(EXCLUDED\.zoho_item_id, receiving_line_zoho\.zoho_item_id\)/.test(rzUpsert!.text));
});

test('line outside the carton → linesUpdated 0, no writes to the line', async () => {
  const { deps, queries } = fakes(true, false);

  const res = await relinkReceivingPo(
    { receivingId: 3, lineId: 999, scope: 'line', zohoPurchaseorderId: 'PO5' },
    'org-1',
    deps,
  );

  assert.equal(res.ok, true);
  assert.equal(res.linesUpdated, 0);
  assert.ok(!queries.some((q) => /INSERT INTO receiving_line_zoho/.test(q.text)));
  assert.ok(!queries.some((q) => /UPDATE receiving_line\b/.test(q.text)));
});
