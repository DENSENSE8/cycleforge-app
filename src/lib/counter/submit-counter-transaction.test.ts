import assert from 'node:assert/strict';
import test from 'node:test';

import { RepairIntakeValidationError } from '@/lib/repair/submit-repair-intake';
import {
  buildStageOrderBody,
  CounterTransactionValidationError,
  interpretStageOrderResponse,
  submitCounterTransaction,
  type LinkableRepairRow,
  type StageOrderResult,
  type SubmitCounterTransactionDeps,
} from './submit-counter-transaction';
import type {
  CounterRetailLine,
  CounterServiceLine,
  CounterTransactionInput,
} from './counter-transaction-types';
import { encodeShipToAddress } from '@/lib/customers/ship-to-address';

const ORG = '00000000-0000-0000-0000-000000000002';
const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

function service(patch: Partial<CounterServiceLine> = {}): CounterServiceLine {
  // `repairReasons` is required by the shared intake rule (reason OR notes).
  return {
    productModel: 'QC35 II',
    serialNumber: 'SN1',
    price: '130',
    repairReasons: ['audio'],
    ...patch,
  };
}

function input(patch: Partial<CounterTransactionInput> = {}): CounterTransactionInput {
  return {
    customer: { phone: '(555) 123-4567', name: 'Jane Doe' },
    clientEventId: KEY,
    ...patch,
  };
}

interface FakeOpts {
  existingCustomer?: { id: number; storedPhone: string; storedName: string } | null;
  existingHeader?: boolean;
  repairThrows?: Error;
  /** Fail only the Nth device — for the partial-failure case N repairs adds. */
  repairThrowsOnIndex?: number;
  /** Override the fake `stageOrder`'s result outright (e.g. a rejection). */
  stageReturns?: StageOrderResult;
  stageThrows?: Error;
  priorOrderConfirms?: string | null;
  enqueueQueued?: boolean;
  /** The repair book as `findLinkableRepairs` sees it. */
  linkable?: LinkableRepairRow[];
  /** Repair ids whose guarded link finds another visit already holding them. */
  claimLost?: number[];
}

function fakes(opts: FakeOpts = {}) {
  const calls = {
    createdCustomers: [] as Array<{ name: string; phone: string }>,
    phoneLookups: [] as string[],
    headers: [] as Array<Record<string, unknown>>,
    patches: [] as Array<Record<string, unknown>>,
    repairInputs: [] as Array<Record<string, unknown>>,
    repairLinks: [] as Array<{ repairId: number; headerId: number }>,
    staged: [] as Array<{ count: number; idempotencyKey: string; lines: CounterRetailLine[] }>,
    priorOrderChecks: [] as Array<{ orderNumber: string; phone: string }>,
    enqueued: [] as Array<Record<string, unknown>>,
    shipTos: [] as Array<{ customerId: number; shipTo: Record<string, string> }>,
  };

  const deps: SubmitCounterTransactionDeps = {
    async findCustomerByPhoneDigits(_orgId, digits) {
      calls.phoneLookups.push(digits);
      return opts.existingCustomer ?? null;
    },
    async createCustomer(_orgId, args) {
      calls.createdCustomers.push({ name: args.name, phone: args.phone });
      return { id: 500, storedPhone: args.phone, storedName: args.name };
    },
    async patchCustomerShipTo(_orgId, customerId, shipTo) {
      calls.shipTos.push({ customerId, shipTo: { ...shipTo } });
    },
    async findHeaderByClientEvent() {
      if (!opts.existingHeader) return null;
      return {
        id: 77,
        status: 'staged',
        customerId: 500,
        priorOrderRef: 'ORD-9',
        stagedSquareOrderId: 'sq-existing',
        subtotalCents: 1234,
        totalCents: 5678,
      };
    },
    async insertHeader(_orgId, args) {
      calls.headers.push({ ...args });
      return {
        id: 900,
        status: 'staged',
        customerId: args.customerId,
        priorOrderRef: args.priorOrderRef,
        stagedSquareOrderId: null,
        subtotalCents: args.subtotalCents,
        totalCents: args.totalCents,
      };
    },
    async patchHeader(_orgId, headerId, patch) {
      calls.patches.push({ headerId, ...patch });
    },
    async submitRepair(repairInput) {
      calls.repairInputs.push(repairInput as Record<string, unknown>);
      if (opts.repairThrows) throw opts.repairThrows;
      if (
        opts.repairThrowsOnIndex !== undefined &&
        calls.repairInputs.length - 1 === opts.repairThrowsOnIndex
      ) {
        throw new Error('device-specific failure');
      }
      return {
        success: true,
        rsNumber: 'RS-1001',
        id: 321,
        zendeskTicketNumber: null,
        zendeskTicketUrl: null,
        customerId: 500,
        documentId: 12,
        signatureUrl: 'https://blob/sig.png',
        signatureWarning: null,
        ticketWarning: null,
      };
    },
    async linkRepairToHeader(_orgId, repairId, headerId) {
      if (opts.claimLost?.includes(repairId)) return false;
      calls.repairLinks.push({ repairId, headerId });
      return true;
    },
    async findLinkableRepairs(_orgId, repairIds) {
      return (opts.linkable ?? []).filter((row) => repairIds.includes(row.id));
    },
    async stageOrder(_orgId, lines, idempotencyKey) {
      calls.staged.push({ count: lines.length, idempotencyKey, lines: [...lines] });
      if (opts.stageThrows) throw opts.stageThrows;
      if (opts.stageReturns) return opts.stageReturns;
      // Mirrors what Square actually returns:
      const totalCents = lines.reduce((sum, l) => sum + l.quantity * l.unitAmountCents, 0);
      return { staged: true, providerOrderId: 'sq-new', totalCents };
    },
    async confirmPriorOrder(args) {
      calls.priorOrderChecks.push({ orderNumber: args.orderNumber, phone: args.phone });
      return opts.priorOrderConfirms ?? null;
    },
    async enqueueTicket(args) {
      calls.enqueued.push(args as unknown as Record<string, unknown>);
      const queued = opts.enqueueQueued ?? true;
      return { outboxId: queued ? 4242 : null, queued };
    },
  };

  return { deps, calls };
}

// ── Validation ──────────────────────────────────────────────────────────────

test('a visit with no items and no service is rejected', async () => {
  const { deps } = fakes();
  await assert.rejects(
    () => submitCounterTransaction(input(), ORG, deps),
    (err: unknown) => {
      assert.ok(err instanceof CounterTransactionValidationError);
      assert.ok(err.missing.some((m) => /item or a service/i.test(m)));
      return true;
    },
  );
});

test('a partial phone number is rejected — it cannot identify anyone', async () => {
  const { deps } = fakes();
  await assert.rejects(
    () => submitCounterTransaction(input({ customer: { phone: '555' }, services: [service()] }), ORG, deps),
    (err: unknown) => err instanceof CounterTransactionValidationError,
  );
});

test('a missing clientEventId is rejected — a replay would double-charge', async () => {
  const { deps } = fakes();
  await assert.rejects(
    () => submitCounterTransaction(input({ clientEventId: '', services: [service()] }), ORG, deps),
    (err: unknown) => {
      assert.ok(err instanceof CounterTransactionValidationError);
      assert.ok(err.missing.includes('clientEventId'));
      return true;
    },
  );
});

// ── Idempotent replay ───────────────────────────────────────────────────────

test('a replayed clientEventId is a no-op that reports the ORIGINAL transaction', async () => {
  const { deps, calls } = fakes({ existingHeader: true });

  const res = await submitCounterTransaction(
    input({ services: [service()], retailLines: [line()] }),
    ORG,
    deps,
  );

  assert.equal(res.idempotentReplay, true);
  assert.equal(res.counterTransactionId, 77);
  assert.equal(res.subtotalCents, 1234);
  assert.equal(res.sale?.providerOrderId, 'sq-existing');
  // Nothing was re-written — that is the whole point.
  assert.deepEqual(calls.headers, [], 'no second header');
  assert.deepEqual(calls.repairInputs, [], 'no second repair');
  assert.deepEqual(calls.staged, [], 'no second staged order');
  assert.deepEqual(calls.enqueued, [], 'no second ticket');
});

function line(patch: Record<string, unknown> = {}) {
  return {
    variationId: 'VAR1',
    sku: 'SKU1',
    productTitle: 'Widget',
    quantity: 1,
    unitAmountCents: 1000,
    ...patch,
  } as CounterTransactionInput['retailLines'][number];
}

// ── The three transaction shapes ────────────────────────────────────────────

test('repair-only: a repair is created, linked, AND staged as its own Square order', async () => {
  // Design choice, stated explicitly:
  const { deps, calls } = fakes();

  const res = await submitCounterTransaction(input({ services: [service()] }), ORG, deps);

  assert.equal(res.repairs[0]?.id, 321);
  assert.equal(res.repairs[0]?.rsNumber, 'RS-1001');
  assert.equal(res.sale?.providerOrderId, 'sq-new');
  assert.equal(calls.staged.length, 1, 'the repair alone is enough to stage an order');
  assert.equal(calls.staged[0].count, 1);
  // The line the fake receiver actually sees — proves the money and the name
  // both made it out of `service()`'s price/repairReasons, not an opaque id.
  assert.equal(calls.staged[0].lines[0].unitAmountCents, 13000);
  assert.match(calls.staged[0].lines[0].productTitle, /QC35 II/);
  assert.match(calls.staged[0].lines[0].productTitle, /audio/);
  assert.deepEqual(calls.repairLinks, [{ repairId: 321, headerId: 900 }]);
  assert.equal(res.status, 'staged');
  assert.equal(res.totalCents, 13000);
  // The identity this whole fix exists for: the staged charge and the header
  // quote must be the SAME number.
  assert.equal(res.sale?.totalCents, res.totalCents);
});

test('retail-only: an order is staged and NO repair record is created', async () => {
  const { deps, calls } = fakes();

  const res = await submitCounterTransaction(input({ retailLines: [line()] }), ORG, deps);

  assert.deepEqual(res.repairs, [], 'a retail-only visit must not mint a repair');
  assert.deepEqual(calls.repairInputs, []);
  assert.equal(res.sale?.providerOrderId, 'sq-new');
  assert.equal(res.subtotalCents, 1000);
  assert.equal(res.totalCents, 1000);
  // The staged order id is recorded so the payment webhook can find this header.
  assert.ok(calls.patches.some((p) => p.stagedSquareOrderId === 'sq-new'));
});

test('combined: both halves persist against one header, and ONE staged order covers both', async () => {
  const { deps, calls } = fakes();

  const res = await submitCounterTransaction(
    input({ services: [service()], retailLines: [line({ unitAmountCents: 500 })] }),
    ORG,
    deps,
  );

  assert.equal(res.repairs[0]?.id, 321);
  assert.equal(res.sale?.providerOrderId, 'sq-new');
  assert.equal(calls.headers.length, 1, 'one visit is one header');
  assert.equal(res.subtotalCents, 500);
  assert.equal(res.totalCents, 13500);
  // ONE stageOrder call, carrying BOTH the retail line and the repair line —
  // a customer with a laptop drop-off and a cable settles on one card
  // presentation rather than two.
  assert.equal(calls.staged.length, 1, 'one card presentation for the whole visit');
  assert.equal(calls.staged[0].count, 2);
  assert.equal(calls.staged[0].idempotencyKey, KEY, 'the VISIT key, not a per-line one');
  // The core identity this fix exists to hold: what gets staged for payment
  // equals what the header claims the visit is worth.
  assert.equal(res.sale?.totalCents, res.totalCents);
});

// ── Linked (existing) repairs ───────────────────────────────────────────────

function linkable(patch: Partial<LinkableRepairRow> = {}): LinkableRepairRow {
  return {
    id: 4799,
    ticketNumber: '#9998',
    productTitle: 'Wave Radio CD',
    serialNumber: '0488AC',
    price: '168.00',
    issue: 'No power',
    counterTransactionId: null,
    ...patch,
  };
}

test('a linked repair is linked, totalled and staged — never re-created, signed or ticketed', async () => {
  const { deps, calls } = fakes({ linkable: [linkable()] });

  const res = await submitCounterTransaction(
    input({
      retailLines: [line({ unitAmountCents: 500 })],
      linkedRepairs: [{ repairId: 4799 }, { repairId: 4799 }],
      ticketWork: { mode: 'none' },
    }),
    ORG,
    deps,
  );

  assert.deepEqual(calls.repairInputs, [], 'an existing repair is never re-submitted as intake');
  assert.deepEqual(calls.repairLinks, [{ repairId: 4799, headerId: 900 }], 'linked once, deduped');
  assert.deepEqual(calls.enqueued, [], 'no helpdesk ticket for a ticket that already exists');
  assert.deepEqual(res.repairs, [], '`repairs` stays the devices taken in on THIS visit');
  // The ticket's own quote ($168.00), not a tablet figure, joins the header.
  assert.equal(res.subtotalCents, 500);
  assert.equal(res.totalCents, 500 + 16800);
  assert.equal(calls.headers[0]?.totalCents, 500 + 16800);
  // One staged order: the retail line plus the linked repair, same money.
  assert.equal(calls.staged.length, 1);
  const repairLine = calls.staged[0].lines.find((l) => l.sku === 'REPAIR-4799');
  assert.equal(repairLine?.unitAmountCents, 16800);
  assert.match(repairLine?.productTitle ?? '', /Wave Radio CD repair — No power/);
  assert.equal(res.sale?.totalCents, res.totalCents);
});

test('a visit carrying ONLY a linked repair submits — no service, no signature needed', async () => {
  const { deps, calls } = fakes({ linkable: [linkable({ issue: null })] });

  const res = await submitCounterTransaction(
    input({ linkedRepairs: [{ repairId: 4799 }] }),
    ORG,
    deps,
  );

  assert.equal(res.status, 'staged');
  assert.equal(res.totalCents, 16800);
  assert.deepEqual(calls.repairLinks, [{ repairId: 4799, headerId: 900 }]);
  // No recorded issue → the line names the ticket, never a bare id.
  assert.match(calls.staged[0].lines[0].productTitle, /Wave Radio CD repair — #9998/);
});

test('a linked repair already on ANOTHER visit is refused before anything is written', async () => {
  const { deps, calls } = fakes({ linkable: [linkable({ counterTransactionId: 57 })] });

  await assert.rejects(
    () =>
      submitCounterTransaction(
        input({ retailLines: [line()], linkedRepairs: [{ repairId: 4799 }] }),
        ORG,
        deps,
      ),
    (err: unknown) => {
      assert.ok(err instanceof CounterTransactionValidationError);
      assert.match(err.message, /#9998 is already on visit #57/);
      return true;
    },
  );
  assert.deepEqual(calls.headers, [], 'no header — the idempotency key stays free to retry');
  assert.deepEqual(calls.createdCustomers, []);
  assert.deepEqual(calls.repairLinks, []);
});

test('a linked repair outside this org\'s book is refused, not silently dropped', async () => {
  const { deps, calls } = fakes({ linkable: [] });
  await assert.rejects(
    () => submitCounterTransaction(input({ linkedRepairs: [{ repairId: 4799 }] }), ORG, deps),
    (err: unknown) => err instanceof CounterTransactionValidationError,
  );
  assert.deepEqual(calls.headers, []);
});

test('a linked repair another visit claims mid-submit is not charged here', async () => {
  const { deps, calls } = fakes({ linkable: [linkable()], claimLost: [4799] });

  const res = await submitCounterTransaction(
    input({ retailLines: [line()], linkedRepairs: [{ repairId: 4799 }] }),
    ORG,
    deps,
  );

  assert.ok(calls.staged[0].lines.every((l) => l.sku !== 'REPAIR-4799'));
  assert.equal(res.status, 'partially_paid');
  assert.ok(res.warnings.some((w) => /#9998 was linked to another visit/.test(w)));
});

// ── Partial failure (doc 04 §5) ─────────────────────────────────────────────

test('sale staged + repair fails → header goes partially_paid and is reconcilable', async () => {
  const { deps, calls } = fakes({ repairThrows: new Error('constraint violation') });

  const res = await submitCounterTransaction(
    input({ services: [service()], retailLines: [line()] }),
    ORG,
    deps,
  );

  assert.equal(res.status, 'partially_paid');
  assert.deepEqual(res.repairs, []);
  assert.equal(res.sale?.providerOrderId, 'sq-new', 'the paid half survives');
  assert.ok(res.warnings.some((w) => /reconcil/i.test(w)));
  assert.ok(calls.patches.some((p) => p.status === 'partially_paid'));
});

test('repair fails with NO sale → stays staged, still reported as a warning', async () => {
  const { deps } = fakes({ repairThrows: new Error('boom') });
  const res = await submitCounterTransaction(input({ services: [service()] }), ORG, deps);
  assert.equal(res.status, 'staged');
  assert.deepEqual(res.repairs, []);
  assert.ok(res.warnings.length > 0);
});

test('an INVALID service line fails the whole submit rather than quietly selling the retail half', async () => {
  // Silently dropping the repair the customer came in for, while charging them for headphones, is worse than a 400.
  const { deps, calls } = fakes();

  await assert.rejects(
    () =>
      submitCounterTransaction(
        input({ services: [service({ serialNumber: '' })], retailLines: [line()] }),
        ORG,
        deps,
      ),
    (err: unknown) => {
      assert.ok(err instanceof CounterTransactionValidationError);
      assert.ok((err as CounterTransactionValidationError).missing.some((m) => m.includes('Serial #')));
      return true;
    },
  );
  assert.deepEqual(calls.staged, [], 'nothing was staged for payment');
  assert.deepEqual(calls.headers, [], 'and no header claimed the idempotency key');
});

test('a validation error that slips PAST the pre-flight degrades, it does not strand the visit', async () => {
  // Reaching this arm means the shared rule and the intake path disagree — a bug in the pre-flight.
  const { deps, calls } = fakes({ repairThrows: new RepairIntakeValidationError(['Serial #']) });

  const res = await submitCounterTransaction(
    input({ services: [service()], retailLines: [line()] }),
    ORG,
    deps,
  );

  assert.equal(res.repairs.length, 0);
  assert.equal(calls.headers.length, 1, 'the header stands, so the visit can be reconciled');
  assert.ok(res.warnings.some((w) => w.includes('needs reconciling')));
});

test('no payment provider connected → warns, does not fail the visit', async () => {
  const { deps } = fakes({ stageReturns: { staged: false, reason: 'not_configured' } });
  const res = await submitCounterTransaction(input({ retailLines: [line()] }), ORG, deps);
  assert.equal(res.sale, null);
  assert.ok(res.warnings.some((w) => /provider is connected/i.test(w)));
});

test('a Square REJECTION is distinguishable from "no provider connected" and names the actual error', async () => {
  // The defect this pins:
  const { deps } = fakes({
    stageReturns: {
      staged: false,
      reason: 'rejected',
      error: 'INVALID_REQUEST_ERROR | order.line_items[0].base_price_money.currency required',
    },
  });
  const res = await submitCounterTransaction(
    input({ services: [service()], retailLines: [line()] }),
    ORG,
    deps,
  );
  assert.equal(res.sale, null);
  assert.ok(
    res.warnings.some((w) => w.includes('base_price_money.currency required')),
    `expected Square's own error text in a warning, got ${JSON.stringify(res.warnings)}`,
  );
  assert.ok(
    !res.warnings.some((w) => /no payment provider is connected/i.test(w)),
    'a rejection must not be reported as "no provider connected" — a provider IS connected here',
  );
  // The repair half still landed; a Square rejection degrades to a warning
  // like every other post-header failure, it does not fail the visit.
  assert.equal(res.repairs[0]?.id, 321);
});

test('a provider throw during staging degrades to a warning', async () => {
  const { deps } = fakes({ stageThrows: new Error('square 503') });
  const res = await submitCounterTransaction(
    input({ services: [service()], retailLines: [line()] }),
    ORG,
    deps,
  );
  assert.equal(res.sale, null);
  assert.equal(res.repairs[0]?.id, 321, 'the repair half still landed');
  assert.ok(res.warnings.some((w) => /could not be staged/i.test(w)));
});

// ── Helpdesk / ticket work ──────────────────────────────────────────────────

test('helpdesk work is QUEUED, never called inline — the counter is never blocked', async () => {
  const { deps, calls } = fakes();

  const res = await submitCounterTransaction(
    input({ services: [service()], ticketWork: { mode: 'create' } }),
    ORG,
    deps,
  );

  assert.equal(res.ticketWork.queued, true);
  assert.equal(res.ticketWork.outboxId, 4242);
  assert.equal(calls.enqueued.length, 1);
  assert.equal(calls.enqueued[0].workType, 'CREATE_TICKET');
  assert.equal(calls.enqueued[0].entityType, 'REPAIR');
  assert.equal(calls.enqueued[0].entityId, 321);
  assert.equal(
    calls.repairInputs[0]?.ticketWork,
    'skip',
    'counter owns the outbox enqueue — inline create must be skipped',
  );
  assert.equal(calls.enqueued[0].counterTransactionId, 900);
});

test('attach mode forwards the provider ticket id', async () => {
  const { deps, calls } = fakes();
  await submitCounterTransaction(
    input({ services: [service()], ticketWork: { mode: 'attach', ticketId: 8080 } }),
    ORG,
    deps,
  );
  assert.equal(calls.enqueued[0].workType, 'ATTACH_TICKET');
  assert.equal(calls.enqueued[0].providerTicketId, 8080);
});

test('a failed enqueue is a warning, not a failed transaction', async () => {
  const { deps } = fakes({ enqueueQueued: false });
  const res = await submitCounterTransaction(
    input({ services: [service()], ticketWork: { mode: 'create' } }),
    ORG,
    deps,
  );
  assert.equal(res.ticketWork.queued, false);
  assert.equal(res.repairs[0]?.id, 321, 'the repair still landed');
  assert.ok(res.warnings.some((w) => /could not be queued/i.test(w)));
});

test('ticket work is skipped (with a warning) on a retail-only visit', async () => {
  const { deps, calls } = fakes();
  const res = await submitCounterTransaction(
    input({ retailLines: [line()], ticketWork: { mode: 'create' } }),
    ORG,
    deps,
  );
  assert.deepEqual(calls.enqueued, [], 'no service line means nothing to anchor a ticket to');
  assert.ok(res.warnings.some((w) => /No service line/i.test(w)));
});

// ── Identity ────────────────────────────────────────────────────────────────

test('an existing customer is matched on phone DIGITS, ignoring formatting', async () => {
  const { deps, calls } = fakes({
    existingCustomer: { id: 42, storedPhone: '555-123-4567', storedName: 'Jane D.' },
  });

  const res = await submitCounterTransaction(input({ services: [service()] }), ORG, deps);

  assert.equal(res.customerId, 42);
  assert.deepEqual(calls.phoneLookups, ['5551234567']);
  assert.deepEqual(calls.createdCustomers, [], 'must not create a duplicate');
});

test('the STORED phone is threaded into the repair so the shared helper matches the same row', async () => {
  // submitRepairIntake looks a customer up by EXACT phone string, then falls
  // back to a NAME match that can merge two different people. Handing it the
  // stored value makes its phone branch hit and its name branch unreachable.
  const { deps, calls } = fakes({
    existingCustomer: { id: 42, storedPhone: '555-123-4567', storedName: 'Jane D.' },
  });

  await submitCounterTransaction(input({ services: [service()] }), ORG, deps);

  const repairCustomer = calls.repairInputs[0].customer as { phone: string; name: string };
  assert.equal(repairCustomer.phone, '555-123-4567');
});

test('a returning customer who types no name gets the name ON FILE, not their phone number', async () => {
  const { deps, calls } = fakes({
    existingCustomer: { id: 42, storedPhone: '555-123-4567', storedName: 'Jane Doe' },
  });

  await submitCounterTransaction(
    input({ customer: { phone: '(555) 123-4567' }, services: [service()] }),
    ORG,
    deps,
  );

  const repairCustomer = calls.repairInputs[0].customer as { name: string };
  assert.equal(repairCustomer.name, 'Jane Doe');
});

test('a typed name overrides the one on file', async () => {
  const { deps, calls } = fakes({
    existingCustomer: { id: 42, storedPhone: '555-123-4567', storedName: 'J. Doe' },
  });
  await submitCounterTransaction(
    input({ customer: { phone: '5551234567', name: 'Jane Q. Doe' }, services: [service()] }),
    ORG,
    deps,
  );
  const repairCustomer = calls.repairInputs[0].customer as { name: string };
  assert.equal(repairCustomer.name, 'Jane Q. Doe');
});

test('a brand-new phone with no name is rejected rather than creating a nameless record', async () => {
  const { deps } = fakes({ existingCustomer: null });
  await assert.rejects(
    () => submitCounterTransaction(input({ customer: { phone: '5559998888' }, services: [service()] }), ORG, deps),
    (err: unknown) => err instanceof CounterTransactionValidationError,
  );
});

// ── Prior order ─────────────────────────────────────────────────────────────

test('a prior order attaches only when the check confirms it', async () => {
  const { deps, calls } = fakes({ priorOrderConfirms: 'ORD-4787' });

  const res = await submitCounterTransaction(
    input({ services: [service()], priorOrder: { orderNumber: '4787', phone: '5551234567' } }),
    ORG,
    deps,
  );

  assert.equal(res.priorOrderRef, 'ORD-4787');
  assert.equal(calls.headers[0].priorOrderRef, 'ORD-4787');
});

test('a prior order that does not confirm is dropped with a warning, not attached', async () => {
  const { deps } = fakes({ priorOrderConfirms: null });

  const res = await submitCounterTransaction(
    input({ services: [service()], priorOrder: { orderNumber: '4787', phone: '5550000000' } }),
    ORG,
    deps,
  );

  assert.equal(res.priorOrderRef, null);
  assert.ok(res.warnings.some((w) => /did not match an order/i.test(w)));
});

test('the prior-order check uses the IDENTITY phone, never a second free-typed one', async () => {
  // Otherwise "order # + phone" degrades to "order # + any phone you like",
  // which is a one-key reveal on an unattended tablet.
  const { deps, calls } = fakes({ priorOrderConfirms: 'ORD-1' });

  await submitCounterTransaction(
    input({
      customer: { phone: '(555) 123-4567', name: 'Jane Doe' },
      services: [service()],
      priorOrder: { orderNumber: '4787', phone: '9999999999' },
    }),
    ORG,
    deps,
  );

  assert.equal(calls.priorOrderChecks[0].phone, '(555) 123-4567');
});

// ── Never charges ───────────────────────────────────────────────────────────

test('the orchestrator never returns a paid status — only the payment webhook may promote', async () => {
  for (const patch of [
    { services: [service()] },
    { retailLines: [line()] },
    { services: [service()], retailLines: [line()] },
  ]) {
    const { deps } = fakes();
    const res = await submitCounterTransaction(input(patch), ORG, deps);
    assert.notEqual(res.status, 'paid', 'this path stages, it does not charge');
  }
});

test('the staged order carries the visit key; each device carries its OWN', async () => {
  const { deps, calls } = fakes();
  await submitCounterTransaction(
    input({ services: [service()], retailLines: [line()] }),
    ORG,
    deps,
  );
  // One order per visit → the visit's key.
  assert.equal(calls.staged[0].idempotencyKey, KEY);
  // One ticket per DEVICE → a key per device. This suffix is why a two-device
  // drop-off produces two helpdesk tickets instead of the second deduping onto
  // the first (the key is the provider-side dedupe).
  assert.equal(calls.repairInputs[0].idempotencyKey, `${KEY}:0`);
});

test('two devices in one visit each get their own repair, ticket key and RS#', async () => {
  const { deps, calls } = fakes();
  const res = await submitCounterTransaction(
    input({
      services: [
        service({ productModel: 'QC35 II', serialNumber: 'SN-A' }),
        service({ productModel: 'Pixel 8', serialNumber: 'SN-B' }),
      ],
    }),
    ORG,
    deps,
  );

  assert.equal(calls.repairInputs.length, 2, 'both devices are taken in');
  assert.equal(calls.repairInputs[0].product.model, 'QC35 II');
  assert.equal(calls.repairInputs[1].product.model, 'Pixel 8');
  assert.deepEqual(
    calls.repairInputs.map((r) => r.idempotencyKey),
    [`${KEY}:0`, `${KEY}:1`],
    'a shared key would collapse both devices onto one ticket',
  );
  assert.equal(res.repairs.length, 2, 'and the caller learns about both');
  // Both link to the SAME header — repair_service.counter_transaction_id is
  // many→one, which is why this needed no migration.
  assert.equal(calls.repairLinks.length, 2);
});

test('an INVALID device fails the visit BEFORE anything is written, whatever its position', async () => {
  // The bug this pins:
  for (const services of [
    [service({ serialNumber: '' }), service()],
    [service(), service({ serialNumber: '' })],
  ]) {
    const { deps, calls } = fakes();
    await assert.rejects(
      () => submitCounterTransaction(input({ services }), ORG, deps),
      (err: Error) => err instanceof CounterTransactionValidationError,
    );
    assert.deepEqual(calls.headers, [], 'no header — the idempotency key stays free to retry');
    assert.deepEqual(calls.repairInputs, [], 'and no device is half-taken-in');
  }
});

test('a pre-flight failure names WHICH device, so the operator knows where to look', async () => {
  const { deps } = fakes();
  await assert.rejects(
    () => submitCounterTransaction(
      input({ services: [service(), service({ price: '' })] }),
      ORG,
      deps,
    ),
    (err: CounterTransactionValidationError) => {
      assert.ok(
        err.missing.some((m) => m.includes('Device 2') && m.includes('Price')),
        `expected a Device 2 / Price message, got ${JSON.stringify(err.missing)}`,
      );
      return true;
    },
  );
});

test('device 2 failing does not erase device 1 — the visit is reconcilable, not failed', async () => {
  // Throwing here would report the whole visit as failed while device 1 sits in
  // the system with the customer's property attached to it.
  const { deps, calls } = fakes({ repairThrowsOnIndex: 1 });
  const res = await submitCounterTransaction(
    input({ services: [service({ productModel: 'Kept' }), service({ productModel: 'Lost' })] }),
    ORG,
    deps,
  );

  assert.equal(res.repairs.length, 1, 'device 1 stays logged');
  assert.equal(calls.repairLinks.length, 1);
  assert.ok(
    res.warnings.some((w) => w.includes('Device 2 of 2') && w.includes('Lost')),
    `a warning must name WHICH device failed — got ${JSON.stringify(res.warnings)}`,
  );
  // The line this pins:
  assert.equal(calls.staged[0]?.count, 1, 'only the SURVIVING device is staged for payment');
  assert.match(calls.staged[0]?.lines[0]?.productTitle ?? '', /Kept/);
});

test('zero-quantity lines are dropped before totalling', async () => {
  const { deps, calls } = fakes();
  const res = await submitCounterTransaction(
    input({ retailLines: [line(), line({ quantity: 0 })] }),
    ORG,
    deps,
  );
  assert.equal(res.subtotalCents, 1000);
  assert.equal(calls.staged[0].count, 1);
});

// ── stageOrder request/response (pure, split out the same way
//    `buildTerminalCheckoutBody` / `paymentStateForTerminalStatus` are in
//    terminal-checkout.test.ts) ───────────────────────────────────────────

test('buildStageOrderBody sends the ORG location_id and currency — was missing/hardcoded', () => {
  // Defects 1 and 2:
  const cfg = { locationId: 'LOC-CA-1', currency: 'CAD' };
  const retail: CounterRetailLine = {
    variationId: null,
    sku: 'SKU1',
    productTitle: 'Widget',
    quantity: 2,
    unitAmountCents: 750,
  };

  const body = buildStageOrderBody([retail], cfg, 'idem-key-1') as {
    idempotency_key: string;
    order: { location_id: string; line_items: Array<Record<string, unknown>> };
  };

  assert.equal(body.idempotency_key, 'idem-key-1');
  assert.equal(body.order.location_id, 'LOC-CA-1', 'location_id must be on the order');
  assert.deepEqual(body.order.line_items[0], {
    name: 'Widget',
    quantity: '2',
    base_price_money: { amount: 750, currency: 'CAD' },
  });
});

test('buildStageOrderBody stages a catalog line ad-hoc at its edited price, never by the Ecwid id', () => {
  // The variationId is the Ecwid listing id. Square cannot resolve it, and a
  // `catalog_object_id` line would charge Square's price instead of the counter's.
  const cfg = { locationId: 'LOC-1', currency: 'USD' };
  const edited: CounterRetailLine = {
    variationId: '812345678',
    sku: '00162',
    productTitle: 'Case',
    quantity: 2,
    unitAmountCents: 400,
  };
  const body = buildStageOrderBody([edited], cfg, 'idem-2') as {
    order: { line_items: Array<Record<string, unknown>> };
  };
  assert.deepEqual(body.order.line_items[0], {
    name: 'Case',
    quantity: '2',
    base_price_money: { amount: 400, currency: 'USD' },
  });
  assert.ok(!JSON.stringify(body).includes('catalog_object_id'));
});

test('buildStageOrderBody carries the item note, and a comp says why it is $0', () => {
  const cfg = { locationId: 'LOC-1', currency: 'USD' };
  const body = buildStageOrderBody(
    [
      { variationId: null, sku: '', productTitle: 'Cable', quantity: 1, unitAmountCents: 500, note: 'Gift wrap' },
      {
        variationId: '1',
        sku: 'A',
        productTitle: 'Case',
        quantity: 1,
        unitAmountCents: 0,
        priceAdjustment: { kind: 'comp', originalUnitAmountCents: 1999, reason: 'Goodwill', staffId: 7 },
      },
    ],
    cfg,
    'idem-3',
  ) as { order: { line_items: Array<Record<string, unknown>> } };
  assert.equal(body.order.line_items[0].note, 'Gift wrap');
  assert.equal(body.order.line_items[1].note, 'Comp · Goodwill');
});

test('interpretStageOrderResponse surfaces the REAL Square error rather than swallowing it', () => {
  // Defect 3: `if (!res.ok || !orderId) return null` discarded `res.errors`
  // outright. The caller then reported "No payment provider is connected" for
  // a request Square explicitly rejected.
  const outcome = interpretStageOrderResponse({
    ok: false,
    status: 400,
    data: {},
    errors: [
      { code: 'INVALID_REQUEST_ERROR', detail: 'location_id is required', field: 'location_id' },
    ],
  } as unknown as Parameters<typeof interpretStageOrderResponse>[0]);

  assert.equal(outcome.staged, false);
  assert.equal((outcome as { reason: string }).reason, 'rejected');
  assert.match((outcome as { error: string }).error, /location_id is required/);
});

test('interpretStageOrderResponse treats a 200 with no order id as a rejection, not a silent success', () => {
  const outcome = interpretStageOrderResponse({ ok: true, data: {}, errors: undefined });
  assert.equal(outcome.staged, false);
});

test('interpretStageOrderResponse reads the provider order id and total on success', () => {
  const outcome = interpretStageOrderResponse({
    ok: true,
    data: { order: { id: 'sq-order-9', total_money: { amount: 13500 } } },
  });
  assert.deepEqual(outcome, { staged: true, providerOrderId: 'sq-order-9', totalCents: 13500 });
});

// ── Walk-in repair, end to end: the ship-to and the ticket ──────────────────

test('a walk-in repair writes every ship-to field and opens a ticket that can reach the customer', async () => {
  const { deps, calls } = fakes();
  const address = encodeShipToAddress({
    address1: ' 12 Main St ',
    address2: 'Apt 4',
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
  });

  await submitCounterTransaction(
    input({
      customer: { phone: '555-123-4567', name: 'Jane Doe', email: 'jane@example.com', address },
      services: [service({ repairReasons: ['No sound'], repairNotes: 'Dropped', notes: 'Rush' })],
      ticketWork: { mode: 'create' },
    }),
    ORG,
    deps,
  );

  assert.deepEqual(calls.shipTos, [
    {
      customerId: 500,
      shipTo: { address1: '12 Main St', address2: 'Apt 4', city: 'Springfield', state: 'IL', postalCode: '62701' },
    },
  ]);
  const payload = calls.enqueued[0]!.payload as { subject: string; body: string };
  assert.match(payload.subject, /Jane Doe · 555-123-4567/);
  for (const fact of [
    'Phone: 555-123-4567',
    'Email: jane@example.com',
    'Issue: No sound',
    'Visit notes: Dropped',
    'Device notes: Rush',
    'Serial: SN1',
    'Ship to: 12 Main St, Apt 4, Springfield IL 62701',
  ]) {
    assert.ok(payload.body.includes(fact), `ticket body is missing "${fact}"`);
  }
});

test('a pickup leaves the customer\'s ship-to alone', async () => {
  const { deps, calls } = fakes({ existingCustomer: { id: 7, storedPhone: '5551234567', storedName: 'Jane' } });
  await submitCounterTransaction(input({ services: [service()] }), ORG, deps);
  assert.deepEqual(calls.shipTos, []);
});
