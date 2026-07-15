import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateThreadToTicket, type EscalateThreadDeps } from './escalate';
import type { EntityThread } from './types';

const ORG = '00000000-0000-0000-0000-000000000001';

function thread(overrides: Partial<EntityThread> = {}): EntityThread {
  return {
    id: 7,
    entityType: 'ORDER',
    entityId: 42,
    status: 'open',
    supportTicketId: null,
    lastMessageAt: null,
    createdBy: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

interface Captured {
  internal: Array<{ orgId: string; subject: string; staffId?: number | null }>;
  zendesk: Array<{ orgId: string; entityType: string; entityId: number; subject: string; note?: string | null }>;
  attach: Array<{ orgId: string; threadId: number; supportTicketId: number }>;
}

function fakes(opts: { loaded?: EntityThread | null; attachIdempotent?: boolean } = {}) {
  const cap: Captured = { internal: [], zendesk: [], attach: [] };
  const loaded = opts.loaded === undefined ? thread() : opts.loaded;
  const deps: EscalateThreadDeps = {
    loadThread: async () => loaded,
    createInternalTicket: async (args) => {
      cap.internal.push(args);
      return { supportTicketId: 100 };
    },
    createZendeskTicket: async (args) => {
      cap.zendesk.push(args);
      return { supportTicketId: 200, externalTicketId: '9001' };
    },
    attach: async (args) => {
      cap.attach.push(args);
      return {
        ok: true as const,
        thread: thread({ supportTicketId: args.supportTicketId }),
        idempotent: opts.attachIdempotent ?? false,
      };
    },
  };
  return { deps, cap };
}

test('escalate internal: creates internal ticket then attaches (no zendesk)', async () => {
  const { deps, cap } = fakes();
  const out = await escalateThreadToTicket({ orgId: ORG, threadId: 7, mode: 'internal', staffId: 5 }, deps);

  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.created, true);
  assert.equal(out.supportTicketId, 100);
  assert.equal(cap.internal.length, 1);
  assert.equal(cap.zendesk.length, 0); // internal path never calls the helpdesk
  assert.equal(cap.internal[0].subject, 'order #42'); // entity-anchored default subject
  assert.equal(cap.attach.length, 1);
  assert.equal(cap.attach[0].supportTicketId, 100);
});

test('escalate zendesk: creates helpdesk ticket + links + attaches', async () => {
  const { deps, cap } = fakes();
  const out = await escalateThreadToTicket(
    { orgId: ORG, threadId: 7, mode: 'zendesk', subject: 'Broken unit', note: 'see photos' },
    deps,
  );

  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.supportTicketId, 200);
  assert.equal(cap.zendesk.length, 1);
  assert.equal(cap.internal.length, 0);
  assert.equal(cap.zendesk[0].subject, 'Broken unit');
  assert.equal(cap.zendesk[0].entityType, 'ORDER'); // anchor threaded from the thread, not the caller
  assert.equal(cap.attach[0].supportTicketId, 200);
});

test('escalate is idempotent when a ticket is already attached (no create)', async () => {
  const { deps, cap } = fakes({ loaded: thread({ supportTicketId: 55 }) });
  const out = await escalateThreadToTicket({ orgId: ORG, threadId: 7, mode: 'internal' }, deps);

  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.created, false);
  assert.equal(out.idempotent, true);
  assert.equal(out.supportTicketId, 55);
  assert.equal(cap.internal.length, 0); // never created a second ticket
  assert.equal(cap.attach.length, 0);
});

test('escalate 404 when the thread does not exist', async () => {
  const { deps, cap } = fakes({ loaded: null });
  const out = await escalateThreadToTicket({ orgId: ORG, threadId: 7, mode: 'internal' }, deps);

  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.status, 404);
  assert.equal(cap.internal.length, 0);
  assert.equal(cap.attach.length, 0);
});

test('escalate 400 on an unknown mode', async () => {
  const { deps } = fakes();
  // @ts-expect-error — deliberately invalid mode
  const out = await escalateThreadToTicket({ orgId: ORG, threadId: 7, mode: 'carrier' }, deps);
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.status, 400);
});
