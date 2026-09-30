import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { REPAIR_DROP_OFF_SOURCE, type IngestInboundOrderResult } from '@/lib/inbound/ingest-inbound-order';
import type { InboundOrderDraft } from '@/lib/inbound/inbound-order-draft';
import type { TxClient } from '@/lib/inbound/purchase-links';
import { receiveWalkInRepairInTx, type ReceiveWalkInRepairDeps } from './walk-in-receiving';

const ORG = '00000000-0000-0000-0000-00000000bbbb' as OrgId;
const TICKET = { id: 4894, productTitle: '  Bose Wave Music System  ', receivedOn: '2026-09-29' };

function fakes(opts: { linkedLineId?: number; unchanged?: boolean } = {}) {
  const sql: Array<{ text: string; params: ReadonlyArray<unknown> }> = [];
  const client: TxClient = {
    query: (async (text: string, params: ReadonlyArray<unknown> = []) => {
      sql.push({ text, params });
      if (/FROM repair_service rs/.test(text)) {
        return {
          rows: [opts.linkedLineId != null
            ? { receiving_line_id: opts.linkedLineId, receiving_id: 40, inbound_order_id: 5 }
            : { receiving_line_id: null, receiving_id: null, inbound_order_id: null }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    }) as TxClient['query'],
  };
  const landed: Array<{ client: TxClient; orgId: OrgId; draft: InboundOrderDraft; ctx: Record<string, unknown> }> = [];
  const deps: ReceiveWalkInRepairDeps = {
    ingest: (async (c: TxClient, orgId: OrgId, draft: unknown, ctx: Record<string, unknown>) => {
      landed.push({ client: c, orgId, draft: draft as InboundOrderDraft, ctx });
      const result: IngestInboundOrderResult = {
        inboundOrderId: 5,
        created: !opts.unchanged,
        unchanged: Boolean(opts.unchanged),
        identity: { sourceType: 'manual', sourcePlatform: 'none', paintPlatform: null, externalOrderId: 'RS-4894', externalOrderIdNorm: 'RS-4894' },
        lines: [{ lineKey: 'L1', receivingLineId: 91, created: !opts.unchanged }],
        receivingId: 40,
        localPickupOrderId: null,
      };
      return result;
    }) as unknown as ReceiveWalkInRepairDeps['ingest'],
  };
  return { client, sql, landed, deps };
}

test('a drop-off ticket lands one in-hand REPAIR order through the one writer and links its line', async () => {
  const f = fakes();
  const receipt = await receiveWalkInRepairInTx(f.client, ORG, TICKET, { staffId: 7 }, f.deps);

  assert.deepEqual(receipt, { receivingId: 40, receivingLineId: 91, inboundOrderId: 5, created: true });
  assert.equal(f.landed.length, 1);
  const { client, orgId, draft, ctx } = f.landed[0];
  assert.equal(client, f.client, 'the order lands on the ticket\'s own transaction');
  assert.equal(orgId, ORG);
  assert.equal(draft.type, 'REPAIR');
  assert.equal(draft.platform, 'manual');
  assert.equal(draft.orderNumber, 'RS-4894', 'identity is the permanent RS-{id}, not the re-keyable ticket #');
  assert.equal(draft.orderDate, '2026-09-29');
  assert.deepEqual(draft.tracking, []);
  assert.equal(draft.vendor, '', 'the customer is never filed as a supplier');
  assert.equal(draft.lines.length, 1);
  assert.equal(draft.lines[0].title, 'Bose Wave Music System');
  assert.equal(draft.lines[0].quantity, 1);
  assert.equal(draft.lines[0].unitCostCents, null, 'a repair price is not a purchase cost');
  assert.deepEqual(ctx, { origin: 'manual', source: REPAIR_DROP_OFF_SOURCE, staffId: 7, sourceEventId: 'repair:4894' });

  // The ticket row is locked before landing, then pointed at its line and stamped a drop-off.
  assert.match(f.sql[0].text, /FOR UPDATE OF rs/);
  assert.deepEqual(f.sql[0].params, [4894, ORG]);
  const link = f.sql.find((s) => /UPDATE repair_service/.test(s.text));
  assert.ok(link);
  const arrival = f.sql.find((s) => /UPDATE receiving_carton/.test(s.text));
  assert.ok(arrival && /COALESCE\(rs\.received_at, rs\.created_at/.test(arrival.text), 'the carton arrived when the ticket did');
  assert.deepEqual(arrival.params, [40, 4894, ORG]);
  assert.match(link.text, /receiving_line_id = \$1/);
  assert.match(link.text, /intake_channel = 'pickup'/);
  assert.deepEqual(link.params, [91, 4894, ORG]);
});

test('a ticket without a title still lands a line that names it', async () => {
  const f = fakes();
  await receiveWalkInRepairInTx(f.client, ORG, { id: 12, productTitle: ' ', receivedOn: 'not-a-date' }, { staffId: null }, f.deps);
  assert.equal(f.landed[0].draft.lines[0].title, 'Repair RS-12');
  assert.equal(f.landed[0].draft.orderDate, null);
});

test('retry: an already-linked ticket lands nothing and writes nothing', async () => {
  const f = fakes({ linkedLineId: 91 });
  const receipt = await receiveWalkInRepairInTx(f.client, ORG, TICKET, { staffId: 7 }, f.deps);

  assert.deepEqual(receipt, { receivingId: 40, receivingLineId: 91, inboundOrderId: 5, created: false });
  assert.equal(f.landed.length, 0, 'no second inbound order');
  assert.equal(f.sql.length, 1, 'only the locked read');
});

test('retry: an order that already landed unchanged is linked, never duplicated', async () => {
  const f = fakes({ unchanged: true });
  const receipt = await receiveWalkInRepairInTx(f.client, ORG, TICKET, { staffId: null, origin: 'backfill' }, f.deps);

  assert.equal(receipt.created, false);
  assert.ok(!f.sql.some((s) => /UPDATE receiving_carton/.test(s.text)), 'an existing carton keeps its arrival');
  assert.equal(receipt.receivingLineId, 91);
  assert.equal(f.landed[0].ctx.origin, 'backfill');
  assert.equal(f.sql.filter((s) => /UPDATE repair_service/.test(s.text)).length, 1);
});
