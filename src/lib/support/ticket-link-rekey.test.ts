import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTicketShipmentReference,
  promoteShipmentTicketToReceiving,
  type AddTicketShipmentReferenceDeps,
  type PromoteShipmentTicketDeps,
} from './ticket-link';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Locks the 2026-07-21 re-key of the shipment-reference writers + the
 * promote-on-scan reader onto `support_ticket_id`. DB-free via injected Deps.
 */

const ORG = 'org-1' as unknown as OrgId;

// ── addTicketShipmentReference (many-STN writer) ────────────────────────────

function addRefFakes(
  opts: { insertReturns?: Array<{ is_primary: boolean }>; existing?: Array<{ is_primary: boolean }> } = {},
) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const events: Array<{ entityId: number; ticketId: number }> = [];
  const deps: AddTicketShipmentReferenceDeps = {
    registerShipment: async () => ({ id: 999 }),
    resolveSupportTicket: async () => ({ id: 500 }),
    runQuery: async (_org, sql, params) => {
      queries.push({ sql, params });
      if (/INSERT INTO ticket_links/.test(sql)) return { rows: opts.insertReturns ?? [{ is_primary: true }] };
      return { rows: opts.existing ?? [] };
    },
    recordLinkEvent: async ({ entityId, ticketId }) => {
      events.push({ entityId, ticketId });
    },
  };
  return { deps, queries, events };
}

test('addTicketShipmentReference inserts on the support-led arbiter + support_ticket_id anchor guard', async () => {
  const { deps, queries, events } = addRefFakes();
  const out = await addTicketShipmentReference(
    { orgId: ORG, ticketId: 9001, shipmentId: 77, staffId: 3 },
    deps,
  );
  assert.equal(out.added, true);
  assert.equal(out.isPrimary, true);
  assert.equal(out.shipmentId, 77);

  const insert = queries.find((q) => /INSERT INTO ticket_links/.test(q.sql))!;
  assert.match(
    insert.sql,
    /ON CONFLICT \(organization_id, support_ticket_id, entity_type, entity_id\) DO NOTHING/,
  );
  assert.match(insert.sql, /support_ticket_id = \$2\s+AND is_primary/);
  assert.ok(
    !/zendesk_ticket_id = \$3\s+AND is_primary/.test(insert.sql),
    'anchor guard is no longer zendesk-keyed',
  );
  // params: [org, supportTicketId(500), zendeskTicketId(9001), shipmentId(77), staffId(3)]
  assert.deepEqual(insert.params, [ORG, 500, 9001, 77, 3]);

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { entityId: 77, ticketId: 9001 });
});

test('addTicketShipmentReference reads the existing role via support_ticket_id on DO NOTHING', async () => {
  const { deps, queries } = addRefFakes({ insertReturns: [], existing: [{ is_primary: false }] });
  const out = await addTicketShipmentReference({ orgId: ORG, ticketId: 9001, shipmentId: 77 }, deps);
  assert.equal(out.added, false);
  assert.equal(out.isPrimary, false);
  const read = queries.find((q) => /SELECT is_primary FROM ticket_links/.test(q.sql))!;
  assert.match(read.sql, /support_ticket_id = \$2/);
  assert.deepEqual(read.params, [ORG, 500, 77]); // keyed on the support ticket, not zendesk
});

// ── promoteShipmentTicketToReceiving (promote-on-scan) ──────────────────────

function promoteFakes(
  row: { zendesk_ticket_id: string | null; support_ticket_id: string | null } | null,
) {
  const linked: Array<{
    supportTicketId: number;
    zendeskTicketId: number | null;
    entityType: string;
    entityId: number;
  }> = [];
  const colUpdates: Array<{ receivingId: number; ticketNumber: string }> = [];
  const deps: PromoteShipmentTicketDeps = {
    runQuery: async () => ({ rows: row ? [row] : [] }),
    linkEntity: async (args) => {
      linked.push({
        supportTicketId: args.supportTicketId,
        zendeskTicketId: args.zendeskTicketId ?? null,
        entityType: args.entityType,
        entityId: args.entityId,
      });
    },
    updateReceivingTicketColumn: async (_org, receivingId, ticketNumber) => {
      colUpdates.push({ receivingId, ticketNumber });
    },
  };
  return { deps, linked, colUpdates };
}

test('promoteShipmentTicketToReceiving promotes an INTERNAL ticket (null zendesk id)', async () => {
  const { deps, linked, colUpdates } = promoteFakes({
    zendesk_ticket_id: null,
    support_ticket_id: '77',
  });
  const ok = await promoteShipmentTicketToReceiving({ orgId: ORG, shipmentId: 5, receivingId: 12 }, deps);
  assert.equal(ok, true);
  assert.equal(linked.length, 1);
  assert.deepEqual(linked[0], {
    supportTicketId: 77,
    zendeskTicketId: null,
    entityType: 'RECEIVING',
    entityId: 12,
  });
  // display cache falls back to the internal registry id when there is no provider id
  assert.deepEqual(colUpdates[0], { receivingId: 12, ticketNumber: '#77' });
});

test('promoteShipmentTicketToReceiving prefers the provider id for the display cache', async () => {
  const { deps, linked, colUpdates } = promoteFakes({
    zendesk_ticket_id: '9001',
    support_ticket_id: '77',
  });
  await promoteShipmentTicketToReceiving({ orgId: ORG, shipmentId: 5, receivingId: 12 }, deps);
  assert.deepEqual(linked[0], {
    supportTicketId: 77,
    zendeskTicketId: 9001,
    entityType: 'RECEIVING',
    entityId: 12,
  });
  assert.deepEqual(colUpdates[0], { receivingId: 12, ticketNumber: '#9001' });
});

test('promoteShipmentTicketToReceiving no-ops when no primary SHIPMENT link exists', async () => {
  const { deps, linked } = promoteFakes(null);
  const ok = await promoteShipmentTicketToReceiving({ orgId: ORG, shipmentId: 5, receivingId: 12 }, deps);
  assert.equal(ok, false);
  assert.equal(linked.length, 0);
});
