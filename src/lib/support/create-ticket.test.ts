import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSupportTicket,
  type CreateSupportTicketDeps,
} from './create-ticket';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org-1' as unknown as OrgId;

function fakes(overrides: Partial<CreateSupportTicketDeps> = {}) {
  const created: Array<{ subject: string; body: string; idempotencyKey?: string | null }> = [];
  const linked: Array<{ ticketId: number; anchor: unknown }> = [];
  const registered: Array<{ providerTicketId: number; subjectCache: string | null }> = [];
  const deps: CreateSupportTicketDeps = {
    createProviderTicket: async ({ subject, body, idempotencyKey }) => {
      created.push({ subject, body, idempotencyKey });
      return { id: 9001, subject };
    },
    linkAnchor: (async ({ ticketId, anchor }) => {
      linked.push({ ticketId, anchor });
      return {
        ticketNumber: `#${ticketId}`,
        ticketUrl: null,
        subject: 'x',
        supportTicketId: 42,
        entityType: 'SHIPMENT',
        entityId: 555,
      };
    }) as CreateSupportTicketDeps['linkAnchor'],
    registerTicket: async ({ providerTicketId, subjectCache }) => {
      registered.push({ providerTicketId, subjectCache });
      return { id: 77 };
    },
    ...overrides,
  };
  return { deps, created, linked, registered };
}

test('createSupportTicket with an anchor links via the shared waist (no separate register)', async () => {
  const { deps, created, linked, registered } = fakes();
  const out = await createSupportTicket(
    { orgId: ORG, subject: 'Damaged unit', note: 'see photos', anchor: { type: 'order', orderId: 12 }, staffId: 5 },
    deps,
  );
  assert.deepEqual(out, {
    supportTicketId: 42,
    providerTicketId: 9001,
    subject: 'Damaged unit',
    linkedEntityType: 'SHIPMENT',
    linkedEntityId: 555,
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].body, 'see photos'); // note becomes the first comment
  assert.equal(linked.length, 1);
  assert.deepEqual(linked[0], { ticketId: 9001, anchor: { type: 'order', orderId: 12 } });
  assert.equal(registered.length, 0); // linkAnchor already registered the support ticket
});

test('createSupportTicket without an anchor registers the ticket in the org registry', async () => {
  const { deps, created, linked, registered } = fakes();
  const out = await createSupportTicket({ orgId: ORG, subject: 'Blank ticket' }, deps);
  assert.equal(out.supportTicketId, 77);
  assert.equal(out.providerTicketId, 9001);
  assert.equal(out.linkedEntityType, null);
  assert.equal(created[0].body, 'Blank ticket'); // body defaults to the subject
  assert.equal(linked.length, 0);
  assert.equal(registered.length, 1);
  assert.deepEqual(registered[0], { providerTicketId: 9001, subjectCache: 'Blank ticket' });
});

test('createSupportTicket threads the idempotency key to the provider create', async () => {
  const { deps, created } = fakes();
  await createSupportTicket({ orgId: ORG, subject: 'x', idempotencyKey: 'submit-abc' }, deps);
  assert.equal(created[0].idempotencyKey, 'submit-abc');
});

test('createSupportTicket falls back to a default subject when blank', async () => {
  const { deps, created } = fakes();
  const out = await createSupportTicket({ orgId: ORG, subject: '   ' }, deps);
  assert.equal(out.subject, 'Support ticket');
  assert.equal(created[0].subject, 'Support ticket');
});
