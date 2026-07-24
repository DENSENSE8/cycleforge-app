import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrderLinkage } from '@/lib/order-linkage';
import {
  buildSupportTicketSubjectFromLinkage,
  hasSupportTicketLinkages,
  pickAnchorFromLinkage,
} from './create-ticket-linkages';
import {
  createSupportTicket,
  type CreateSupportTicketDeps,
} from './create-ticket';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org-1' as unknown as OrgId;

function sampleLinkage(overrides: Partial<OrderLinkage> = {}): OrderLinkage {
  return {
    matchedBy: 'order',
    order: { id: 12, orderId: 'ECW-100', productTitle: 'Speaker', sku: 'SPK' },
    trackings: [
      {
        shipmentId: 501,
        tracking: '1ZPRIMARY',
        isPrimary: true,
        carrier: 'UPS',
        statusCategory: null,
        isDelivered: null,
      },
      {
        shipmentId: 502,
        tracking: '1ZEXTRA',
        isPrimary: false,
        carrier: 'UPS',
        statusCategory: null,
        isDelivered: null,
      },
    ],
    serials: [{ serialUnitId: 9, serial: 'SN-ABC', state: 'allocated' }],
    tickets: [],
    ...overrides,
  };
}

test('pickAnchorFromLinkage prefers explicit anchor and collects extra trackings', () => {
  const plan = pickAnchorFromLinkage({
    explicitAnchor: { type: 'order', orderId: 12 },
    linkages: { tracking: '1ZEXTRA' },
    resolved: sampleLinkage(),
  });
  assert.deepEqual(plan.anchor, { type: 'order', orderId: 12 });
  // Primary STN skipped; extra + typed extras that aren't primary remain.
  assert.deepEqual(plan.extraTrackingRefs, ['1ZEXTRA']);
});

test('pickAnchorFromLinkage uses resolved order when no explicit anchor', () => {
  const plan = pickAnchorFromLinkage({
    linkages: { order: 'ECW-100' },
    resolved: sampleLinkage(),
  });
  assert.deepEqual(plan.anchor, { type: 'order', orderId: 12 });
  assert.deepEqual(plan.extraTrackingRefs, ['1ZEXTRA']);
});

test('pickAnchorFromLinkage falls back to typed tracking', () => {
  const plan = pickAnchorFromLinkage({
    linkages: { tracking: '1ZONLY' },
    resolved: {
      matchedBy: 'tracking',
      order: null,
      trackings: [
        {
          shipmentId: 77,
          tracking: '1ZONLY',
          isPrimary: true,
          carrier: null,
          statusCategory: null,
          isDelivered: null,
        },
      ],
      serials: [],
      tickets: [],
    },
  });
  assert.deepEqual(plan.anchor, { type: 'tracking', trackingNumber: '1ZONLY' });
  assert.deepEqual(plan.extraTrackingRefs, []);
});

test('buildSupportTicketSubjectFromLinkage embeds order / TRK / serial facts', () => {
  const subject = buildSupportTicketSubjectFromLinkage(sampleLinkage());
  assert.equal(subject, 'Support // Order #ECW-100 // TRK#1ZPRIMARY // SN SN-ABC');
});

test('hasSupportTicketLinkages is false for empty / whitespace', () => {
  assert.equal(hasSupportTicketLinkages(null), false);
  assert.equal(hasSupportTicketLinkages({ order: '  ' }), false);
  assert.equal(hasSupportTicketLinkages({ order: '12' }), true);
});

function fakes(overrides: Partial<CreateSupportTicketDeps> = {}) {
  const created: Array<{ subject: string; body: string; idempotencyKey?: string | null }> = [];
  const linked: Array<{ ticketId: number; anchor: unknown }> = [];
  const registered: Array<{ providerTicketId: number; subjectCache: string | null }> = [];
  const refs: Array<{ ticketId: number; trackingNumber?: string }> = [];
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
    resolveLinkage: async () => sampleLinkage(),
    addShipmentReference: (async ({ ticketId, trackingNumber }) => {
      refs.push({ ticketId, trackingNumber });
      return { shipmentId: 502, isPrimary: false, added: true };
    }) as CreateSupportTicketDeps['addShipmentReference'],
    ...overrides,
  };
  return { deps, created, linked, registered, refs };
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

test('createSupportTicket resolves linkages and attaches extra tracking refs', async () => {
  const { deps, linked, refs, registered } = fakes();
  const out = await createSupportTicket(
    {
      orgId: ORG,
      subject: 'Return',
      linkages: { order: 'ECW-100', tracking: '1ZEXTRA' },
    },
    deps,
  );
  assert.equal(out.supportTicketId, 42);
  assert.deepEqual(linked[0]?.anchor, { type: 'order', orderId: 12 });
  assert.equal(registered.length, 0);
  assert.deepEqual(refs, [{ ticketId: 9001, trackingNumber: '1ZEXTRA' }]);
});
