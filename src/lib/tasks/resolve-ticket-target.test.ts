/** `#48120` → a throwable ticket, DB-free. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTicketTarget, type TicketTargetDeps } from './resolve-ticket-target';

function deps(overrides: Partial<TicketTargetDeps> = {}): {
  deps: TicketTargetDeps;
  registered: Array<{ providerTicketId: number; subject: string | null; status: string | null }>;
  fetched: number[];
} {
  const registered: Array<{
    providerTicketId: number;
    subject: string | null;
    status: string | null;
  }> = [];
  const fetched: number[] = [];
  return {
    registered,
    fetched,
    deps: {
      findRegistered: async () => null,
      fetchProviderTicket: async (id) => {
        fetched.push(id);
        return null;
      },
      register: async (args) => {
        registered.push(args);
        return { id: 900, providerTicketId: args.providerTicketId, subject: args.subject, status: args.status };
      },
      ...overrides,
    },
  };
}

test('a registered ticket resolves to its LOCAL id, never the number typed', async () => {
  const { deps: d, fetched } = deps({
    findRegistered: async (providerTicketId) => ({
      id: 312,
      providerTicketId,
      subject: 'Cracked housing',
      status: 'open',
    }),
  });

  const out = await resolveTicketTarget('#48120', d);

  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.target.entityType, 'support_ticket');
  // The registry id — what POST /api/tasks anchors on.
  assert.equal(out.target.entityId, 312);
  // The quoted number — what the operator reads.
  assert.equal(out.target.label, 'Ticket 48120');
  assert.equal(out.target.sublabel, 'Cracked housing');
  assert.equal(out.registered, false);
  // A ticket the org already mirrors costs no helpdesk round trip.
  assert.deepEqual(fetched, []);
});

test('a bare number resolves the same as a hashed one', async () => {
  const { deps: d } = deps({
    findRegistered: async (providerTicketId) => ({
      id: 7,
      providerTicketId,
      subject: null,
      status: null,
    }),
  });

  const out = await resolveTicketTarget('48120', d);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.providerTicketId, 48120);
  assert.equal(out.target.sublabel, undefined);
});

test('an unmirrored ticket the helpdesk confirms is registered, then thrown at', async () => {
  const { deps: d, registered } = deps({
    fetchProviderTicket: async () => ({ subject: 'Wrong item shipped', status: 'pending' }),
  });

  const out = await resolveTicketTarget('48120', d);

  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.registered, true);
  assert.equal(out.supportTicketId, 900);
  assert.deepEqual(registered, [
    { providerTicketId: 48120, subject: 'Wrong item shipped', status: 'pending' },
  ]);
});

test('a number the helpdesk does not know mints NOTHING', async () => {
  const { deps: d, registered } = deps();

  const out = await resolveTicketTarget('999999', d);

  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, 'not_found');
  // The whole point: a typo must not create a registry row.
  assert.deepEqual(registered, []);
});

test('a helpdesk that throws is unavailable, not empty', async () => {
  const { deps: d, registered } = deps({
    fetchProviderTicket: async () => {
      throw new Error('ECONNRESET');
    },
  });

  const out = await resolveTicketTarget('48120', d);

  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, 'helpdesk_unavailable');
  assert.deepEqual(registered, []);
});

test('a non-number is refused before either lookup runs', async () => {
  const { deps: d, fetched } = deps({
    findRegistered: async () => {
      throw new Error('must not be reached');
    },
  });

  const out = await resolveTicketTarget('R-4471', d);

  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, 'invalid_number');
  assert.deepEqual(fetched, []);
});
