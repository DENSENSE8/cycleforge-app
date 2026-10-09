import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { HelpdeskProvider } from '@/lib/integrations/helpdesk';
import type { EnqueueTicketWorkArgs } from '@/lib/support/ticket-outbox';
import {
  createRepairIntakeTicket,
  type CreateRepairIntakeTicketDeps,
  type CreateRepairIntakeTicketInput,
} from './create-repair-intake-ticket';

const ORG = 'org-1' as unknown as OrgId;

function baseInput(
  overrides: Partial<CreateRepairIntakeTicketInput> = {},
): CreateRepairIntakeTicketInput {
  return {
    orgId: ORG,
    repairServiceId: 42,
    customerName: 'Ada Lovelace',
    customerPhone: '555-0100',
    customerEmail: 'ada@example.com',
    productTitle: 'SoundLink Mini',
    issue: 'No power',
    serialNumber: 'SN-123',
    price: '89.00',
    notes: 'Walk-in',
    idempotencyKey: 'idem-1',
    ...overrides,
  };
}

interface Captured {
  getHelpdeskOrgs: OrgId[];
  stamps: Array<{ repairId: number; ticketNumber: string; orgId: OrgId }>;
  links: Array<{ orgId: OrgId; ticketId: number; repairId: number }>;
  enqueued: EnqueueTicketWorkArgs[];
  createCalls: Array<{ subject: string; external_id?: string }>;
}

function fakes(opts: {
  helpdesk?: HelpdeskProvider | null | 'throw';
  enqueueQueued?: boolean;
  linkThrows?: Error;
} = {}) {
  const cap: Captured = {
    getHelpdeskOrgs: [],
    stamps: [],
    links: [],
    enqueued: [],
    createCalls: [],
  };

  const helpdesk: HelpdeskProvider | null =
    opts.helpdesk === 'throw'
      ? ({
          provider: 'zendesk',
          createTicket: async () => {
            throw new Error('zendesk 503');
          },
        } as unknown as HelpdeskProvider)
      : opts.helpdesk === null
        ? null
        : opts.helpdesk === undefined
          ? ({
              provider: 'zendesk',
              createTicket: async (input) => {
                cap.createCalls.push({
                  subject: input.subject,
                  external_id: input.external_id,
                });
                return { id: 9001 } as Awaited<ReturnType<HelpdeskProvider['createTicket']>>;
              },
            } as unknown as HelpdeskProvider)
          : opts.helpdesk;

  const deps: CreateRepairIntakeTicketDeps = {
    getHelpdesk: async (orgId) => {
      cap.getHelpdeskOrgs.push(orgId);
      return helpdesk;
    },
    stampTicketNumber: async (repairId, ticketNumber, orgId) => {
      cap.stamps.push({ repairId, ticketNumber, orgId });
    },
    linkAnchor: async (args) => {
      if (opts.linkThrows) throw opts.linkThrows;
      cap.links.push(args);
    },
    enqueue: async (args) => {
      cap.enqueued.push(args);
      return {
        outboxId: opts.enqueueQueued === false ? null : 77,
        queued: opts.enqueueQueued !== false,
      };
    },
  };

  return { deps, cap };
}

test('create: happy path creates via helpdesk, stamps #id, and links the repair', async () => {
  const { deps, cap } = fakes();
  const out = await createRepairIntakeTicket(baseInput(), deps);

  assert.equal(out.zendeskTicketNumber, '#9001');
  assert.equal(out.ticketWarning, null);
  assert.deepEqual(cap.getHelpdeskOrgs, [ORG]);
  assert.equal(cap.createCalls.length, 1);
  assert.equal(cap.createCalls[0].external_id, 'repair:42');
  assert.deepEqual(cap.stamps, [{ repairId: 42, ticketNumber: '#9001', orgId: ORG }]);
  assert.deepEqual(cap.links, [{ orgId: ORG, ticketId: 9001, repairId: 42 }]);
  assert.equal(cap.enqueued.length, 0);
});

test('ticketWork skip: no helpdesk, stamp, link, or enqueue', async () => {
  const { deps, cap } = fakes();
  const out = await createRepairIntakeTicket(baseInput({ ticketWork: 'skip' }), deps);

  assert.equal(out.zendeskTicketNumber, null);
  assert.equal(out.ticketWarning, null);
  assert.equal(cap.getHelpdeskOrgs.length, 0);
  assert.equal(cap.stamps.length, 0);
  assert.equal(cap.links.length, 0);
  assert.equal(cap.enqueued.length, 0);
});

test('no helpdesk provider: enqueues CREATE_TICKET and returns a warning', async () => {
  const { deps, cap } = fakes({ helpdesk: null });
  const out = await createRepairIntakeTicket(baseInput(), deps);

  assert.equal(out.zendeskTicketNumber, null);
  assert.match(out.ticketWarning ?? '', /queued for retry/i);
  assert.equal(cap.enqueued.length, 1);
  assert.equal(cap.enqueued[0].workType, 'CREATE_TICKET');
  assert.equal(cap.enqueued[0].entityType, 'REPAIR');
  assert.equal(cap.enqueued[0].entityId, 42);
  assert.equal(cap.enqueued[0].orgId, ORG);
  assert.equal(cap.enqueued[0].payload?.idempotencyKey, 'idem-1');
  assert.equal(cap.stamps.length, 0);
});

test('helpdesk create throw: enqueues CREATE_TICKET and does not stamp', async () => {
  const { deps, cap } = fakes({ helpdesk: 'throw' });
  const out = await createRepairIntakeTicket(baseInput(), deps);

  assert.equal(out.zendeskTicketNumber, null);
  assert.match(out.ticketWarning ?? '', /queued for retry/i);
  assert.equal(cap.enqueued.length, 1);
  assert.equal(cap.enqueued[0].workType, 'CREATE_TICKET');
  assert.equal(cap.stamps.length, 0);
  assert.equal(cap.links.length, 0);
});

test('link failure after create still returns the stamped ticket number', async () => {
  const { deps, cap } = fakes({ linkThrows: new Error('link failed') });
  const out = await createRepairIntakeTicket(baseInput(), deps);

  assert.equal(out.zendeskTicketNumber, '#9001');
  assert.equal(out.ticketWarning, null);
  assert.equal(cap.stamps.length, 1);
  assert.equal(cap.enqueued.length, 0);
});
