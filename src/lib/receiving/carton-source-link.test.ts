import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recomputeCartonSourceLink } from '@/lib/receiving/carton-source-link';

type Row = Record<string, unknown>;

/**
 * Fake Queryable that routes each SQL text to a canned result and records
 * every call. Routing is by substring so the assertions double as a guard on
 * WHICH tables the SQL reads — the 2026-07 regression was this module still
 * selecting zoho_purchaseorder_id from receiving_line after the Wave-3
 * inversion moved line Zoho identity into receiving_line_zoho.
 */
function fakeDb(routes: Array<{ match: string; rows: Row[] }>) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      const hit = routes.find((r) => text.includes(r.match));
      return { rows: hit?.rows ?? [], rowCount: hit?.rows.length ?? 0 };
    },
  };
}

describe('recomputeCartonSourceLink — Zoho-PO promotion', () => {
  it('reads line Zoho identity from receiving_line_zoho and promotes the carton', async () => {
    const db = fakeDb([
      { match: 'source_order_id', rows: [] },
      {
        match: 'FROM receiving_carton WHERE id',
        rows: [{ source: 'unmatched', source_platform: null, zoho_purchaseorder_id: null }],
      },
      {
        match: 'receiving_line_zoho',
        rows: [{ zoho_purchaseorder_id: 'ZPO-9', zoho_purchaseorder_number: 'PO-14-9' }],
      },
      { match: "source = 'zoho_po' AND id <>", rows: [] },
    ]);

    await recomputeCartonSourceLink(41, db);

    const promotion = db.calls.find((c) => c.text.includes('receiving_line_zoho'));
    assert.ok(promotion, 'line Zoho lookup must join receiving_line_zoho');
    // The dropped spine columns must never be selected from receiving_line itself.
    assert.doesNotMatch(promotion.text, /zoho_purchaseorder_id\s*,?\s*\n?\s*FROM receiving_line\b/);

    const update = db.calls.find((c) => c.text.includes("source = 'zoho_po'") && c.text.startsWith('UPDATE'));
    assert.ok(update, 'unmatched carton with a Zoho-linked line must be promoted');
    assert.deepEqual(update.params, [41, 'ZPO-9', 'PO-14-9']);
  });

  it('leaves a carton already matched to a real Zoho PO untouched', async () => {
    const db = fakeDb([
      { match: 'source_order_id', rows: [{ source_order_id: 'ECWID-1', source_system: 'ecwid' }] },
      {
        match: 'FROM receiving_carton WHERE id',
        rows: [{ source: 'zoho_po', source_platform: null, zoho_purchaseorder_id: 'ZPO-1' }],
      },
    ]);

    await recomputeCartonSourceLink(42, db);

    assert.equal(
      db.calls.some((c) => c.text.startsWith('UPDATE')),
      false,
      'a real-PO carton must never be rewritten',
    );
  });
});
