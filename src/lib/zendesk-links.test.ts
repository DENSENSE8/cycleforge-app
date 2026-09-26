import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linkSupportTicketEntity,
  type LinkSupportTicketEntityDeps,
} from './zendesk-links';

/** Locks the 2026-07-21 re-key of the canonical anchor writer: */

const ORG = '00000000-0000-0000-0000-000000000001';

function fakeTx() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: (async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }) as never,
  };
  const deps: LinkSupportTicketEntityDeps = {
    runInTenantTx: async (_orgId, fn) => fn(client as never),
  };
  return { deps, calls };
}

test('linkSupportTicketEntity demotes the prior anchor keyed on support_ticket_id', async () => {
  const { deps, calls } = fakeTx();
  await linkSupportTicketEntity(
    { orgId: ORG, supportTicketId: 42, zendeskTicketId: 9001, entityType: 'ORDER', entityId: 7, staffId: 5 },
    deps,
  );
  assert.equal(calls.length, 2, 'demote then upsert');
  const demote = calls[0];
  assert.match(demote.sql, /UPDATE ticket_links/);
  assert.match(demote.sql, /link_role = 'reference'/);
  assert.match(demote.sql, /support_ticket_id = \$2/);
  assert.ok(!/zendesk_ticket_id = \$2/.test(demote.sql), 'demote is not keyed on the zendesk id');
  assert.deepEqual(demote.params, [ORG, 42, 'ORDER', 7]);
});

test('linkSupportTicketEntity upserts on the support-led arbiter (never the zendesk one)', async () => {
  const { deps, calls } = fakeTx();
  await linkSupportTicketEntity(
    { orgId: ORG, supportTicketId: 42, zendeskTicketId: 9001, entityType: 'ORDER', entityId: 7 },
    deps,
  );
  const insert = calls[1];
  assert.match(insert.sql, /INSERT INTO ticket_links/);
  assert.match(
    insert.sql,
    /ON CONFLICT \(organization_id, support_ticket_id, entity_type, entity_id\)/,
  );
  assert.ok(
    !/ON CONFLICT \(organization_id, zendesk_ticket_id/.test(insert.sql),
    'must not conflict on the legacy zendesk-led key',
  );
  assert.deepEqual(insert.params, [ORG, 42, 9001, 'ORDER', 7, null]);
});

test('linkSupportTicketEntity accepts an INTERNAL ticket (null zendesk id) — the point of the re-key', async () => {
  const { deps, calls } = fakeTx();
  await linkSupportTicketEntity(
    { orgId: ORG, supportTicketId: 55, zendeskTicketId: null, entityType: 'RECEIVING', entityId: 12 },
    deps,
  );
  assert.deepEqual(calls[1].params, [ORG, 55, null, 'RECEIVING', 12, null]);
});
