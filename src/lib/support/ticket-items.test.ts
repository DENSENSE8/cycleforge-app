/**
 * support_ticket_items domain — validation and idempotency, DB-free.
 *
 *   node --import tsx --test src/lib/support/ticket-items.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deleteTicketItem,
  normalizeTicketItemsInput,
  recordTicketItems,
  suggestTicketProducts,
  TicketItemsError,
  type TicketItemsDeps,
} from './ticket-items';
import type { SupportTicketItemCreate } from './ticket-items-shared';

const ORG = '00000000-0000-0000-0000-000000000001';

interface Row {
  id: number;
  organization_id: string;
  support_ticket_id: number;
  sku_catalog_id: number;
  role: string;
  qty: number;
  note: string | null;
  zendesk_comment_id: number | null;
  order_id: null;
  shipping_label_purchase_id: null;
  staff_id: number | null;
  staff_name: string | null;
  client_event_id: string;
  created_at: string;
}

/** An in-memory table that answers the four statements the lib issues. */
function fakeDeps(opts: { ticketIdByZendesk?: Record<number, number>; linked?: number[] } = {}) {
  const rows: Row[] = [];
  const ticketIdByZendesk = opts.ticketIdByZendesk ?? { 10092: 546 };
  const deps: TicketItemsDeps = {
    resolveSupportTicketId: async (_org, zendeskTicketId) => ticketIdByZendesk[zendeskTicketId] ?? 1,
    readProductFaces: async (_org, ids) =>
      ids.map((id) => ({ skuCatalogId: id, sku: `SKU-${id}`, title: `Product ${id}`, imageUrl: null, onHand: 1, bin: null })),
    runTransaction: async (_org, fn) =>
      fn({
        query: (async (sql: string, params: unknown[]) => {
          if (sql.includes('INSERT INTO support_ticket_items')) {
            const [org, ticket, comment, staff, skus, roles, qtys, notes, ids] = params as [
              string, number, number | null, number | null, number[], string[], number[], (string | null)[], string[],
            ];
            const inserted: { client_event_id: string }[] = [];
            ids.forEach((cid, i) => {
              if (rows.some((r) => r.organization_id === org && r.client_event_id === cid)) return;
              rows.push({
                id: rows.length + 1, organization_id: org, support_ticket_id: ticket, sku_catalog_id: skus[i],
                role: roles[i], qty: qtys[i], note: notes[i], zendesk_comment_id: comment, order_id: null,
                shipping_label_purchase_id: null, staff_id: staff, staff_name: 'Kai', client_event_id: cid,
                created_at: '2026-10-03T00:00:00.000Z',
              });
              inserted.push({ client_event_id: cid });
            });
            return { rows: inserted };
          }
          if (sql.includes('client_event_id = ANY')) {
            const [org, ids] = params as [string, string[]];
            return { rows: rows.filter((r) => r.organization_id === org && ids.includes(r.client_event_id)) };
          }
          if (sql.includes('DELETE FROM support_ticket_items')) {
            const [org, zendesk, itemId] = params as [string, string, number];
            const ticket = ticketIdByZendesk[Number(zendesk)];
            const idx = rows.findIndex((r) => r.organization_id === org && r.id === itemId && r.support_ticket_id === ticket);
            return { rows: idx < 0 ? [] : rows.splice(idx, 1) };
          }
          if (sql.includes('FROM ticket_links')) return { rows: (opts.linked ?? []).map((id) => ({ sku_catalog_id: id })) };
          if (sql.includes('GROUP BY sku_catalog_id')) {
            return { rows: [...new Set(rows.map((r) => r.sku_catalog_id))].map((id) => ({ sku_catalog_id: id })) };
          }
          throw new Error(`unexpected SQL: ${sql}`);
        }) as never,
      }),
  };
  return { deps, rows };
}

const pick = (over: Partial<SupportTicketItemCreate> = {}): SupportTicketItemCreate => ({
  skuCatalogId: 7,
  role: 'replacement',
  qty: 1,
  clientEventId: 'sti:aaaaaaaa-0001',
  ...over,
});

describe('normalizeTicketItemsInput', () => {
  it('trims notes and keeps valid picks', () => {
    assert.deepEqual(normalizeTicketItemsInput([pick({ note: '  boxed  ' })]), [
      { skuCatalogId: 7, role: 'replacement', qty: 1, note: 'boxed', clientEventId: 'sti:aaaaaaaa-0001' },
    ]);
  });

  for (const [label, bad] of [
    ['an unknown role', pick({ role: 'refund' as never })],
    ['qty 0', pick({ qty: 0 })],
    ['a fractional qty', pick({ qty: 1.5 })],
    ['qty past the cap', pick({ qty: 1000 })],
    ['no catalog id', pick({ skuCatalogId: 0 })],
    ['a short clientEventId', pick({ clientEventId: 'x' })],
  ] as const) {
    it(`rejects ${label} with a 400`, () => {
      assert.throws(
        () => normalizeTicketItemsInput([bad]),
        (e: unknown) => e instanceof TicketItemsError && e.status === 400,
      );
    });
  }

  it('rejects an empty batch and a duplicate clientEventId inside one batch', () => {
    assert.throws(() => normalizeTicketItemsInput([]), TicketItemsError);
    assert.throws(() => normalizeTicketItemsInput([pick(), pick({ skuCatalogId: 8 })]), /Duplicate clientEventId/);
  });
});

describe('recordTicketItems', () => {
  it('logs a batch against the resolved ticket and its comment', async () => {
    const { deps, rows } = fakeDeps();
    const out = await recordTicketItems(
      {
        orgId: ORG,
        staffId: 3,
        zendeskTicketId: 10092,
        zendeskCommentId: 555,
        items: [pick(), pick({ skuCatalogId: 8, role: 'return', qty: 2, clientEventId: 'sti:aaaaaaaa-0002' })],
      },
      deps,
    );
    assert.equal(out.created, 2);
    assert.deepEqual(rows.map((r) => [r.support_ticket_id, r.sku_catalog_id, r.role, r.qty, r.zendesk_comment_id]), [
      [546, 7, 'replacement', 1, 555],
      [546, 8, 'return', 2, 555],
    ]);
    assert.equal(out.items[1].product.title, 'Product 8');
    assert.equal(out.items[0].ticketId, 10092);
  });

  it('is idempotent per clientEventId: a replay writes nothing and returns the same rows', async () => {
    const { deps, rows } = fakeDeps();
    const args = { orgId: ORG, staffId: 3, zendeskTicketId: 10092, items: [pick()] };
    const first = await recordTicketItems(args, deps);
    const replay = await recordTicketItems(args, deps);
    assert.equal(first.created, 1);
    assert.equal(replay.created, 0);
    assert.equal(rows.length, 1);
    assert.deepEqual(replay.items.map((i) => i.id), first.items.map((i) => i.id));
  });

  it('a clientEventId already used on ANOTHER ticket is a 409, not a second row', async () => {
    const { deps, rows } = fakeDeps({ ticketIdByZendesk: { 10092: 546, 10093: 547 } });
    await recordTicketItems({ orgId: ORG, staffId: 3, zendeskTicketId: 10092, items: [pick()] }, deps);
    await assert.rejects(
      recordTicketItems({ orgId: ORG, staffId: 3, zendeskTicketId: 10093, items: [pick()] }, deps),
      (e: unknown) => e instanceof TicketItemsError && e.status === 409,
    );
    assert.equal(rows.length, 1);
  });

  it('drops a non-positive comment id rather than storing it', async () => {
    const { deps, rows } = fakeDeps();
    await recordTicketItems({ orgId: ORG, staffId: 3, zendeskTicketId: 10092, zendeskCommentId: -5, items: [pick()] }, deps);
    assert.equal(rows[0].zendesk_comment_id, null);
  });
});

describe('deleteTicketItem', () => {
  it('undoes an item on its own ticket only', async () => {
    const { deps, rows } = fakeDeps({ ticketIdByZendesk: { 10092: 546, 10093: 547 } });
    const { items } = await recordTicketItems({ orgId: ORG, staffId: 3, zendeskTicketId: 10092, items: [pick()] }, deps);
    assert.equal(await deleteTicketItem({ orgId: ORG, zendeskTicketId: 10093, itemId: items[0].id }, deps), null);
    const gone = await deleteTicketItem({ orgId: ORG, zendeskTicketId: 10092, itemId: items[0].id }, deps);
    assert.equal(gone?.product.skuCatalogId, 7);
    assert.equal(rows.length, 0);
  });
});

describe('suggestTicketProducts', () => {
  it('prefers the ticket’s linked products', async () => {
    const { deps } = fakeDeps({ linked: [11, 12] });
    const out = await suggestTicketProducts({ orgId: ORG, zendeskTicketId: 10092, staffId: 3 }, deps);
    assert.equal(out.source, 'ticket');
    assert.deepEqual(out.products.map((p) => p.skuCatalogId), [11, 12]);
  });

  it('falls back to recent picks when the ticket links nothing', async () => {
    const { deps } = fakeDeps();
    await recordTicketItems({ orgId: ORG, staffId: 3, zendeskTicketId: 10092, items: [pick({ skuCatalogId: 30 })] }, deps);
    const out = await suggestTicketProducts({ orgId: ORG, zendeskTicketId: 10092, staffId: 3 }, deps);
    assert.equal(out.source, 'recent');
    assert.deepEqual(out.products.map((p) => p.skuCatalogId), [30]);
  });
});
