import assert from 'node:assert/strict';
import test from 'node:test';

import { RepairIntakeValidationError } from '@/lib/repair/submit-repair-intake';
import {
  CounterTransactionValidationError,
  submitCounterTransaction,
  type SubmitCounterTransactionDeps,
} from './submit-counter-transaction';
import type {
  CounterServiceLine,
  CounterTransactionInput,
} from './counter-transaction-types';

const ORG = '00000000-0000-0000-0000-000000000002';
const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

function service(patch: Partial<CounterServiceLine> = {}): CounterServiceLine {
  // `repairReasons` is required by the shared intake rule (reason OR notes).
  // It was absent here and the tests still passed, because the FAKE
  // `submitRepair` never validated — so the fixture described an input the real
  // helper would have rejected. The counter's pre-flight (SQ6) checks the same
  // rule up front, which is what surfaced it.
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
  stageReturns?: { providerOrderId: string; totalCents: number | null } | null;
  stageThrows?: Error;
  priorOrderConfirms?: string | null;
  enqueueQueued?: boolean;
}

function fakes(opts: FakeOpts = {}) {
  const calls = {
    createdCustomers: [] as Array<{ name: string; phone: string }>,
    phoneLookups: [] as string[],
    headers: [] as Array<Record<string, unknown>>,
    patches: [] as Array<Record<string, unknown>>,
    repairInputs: [] as Array<Record<string, unknown>>,
    repairLinks: [] as Array<{ repairId: number; headerId: number }>,
    staged: [] as Array<{ count: number; idempotencyKey: string }>,
    priorOrderChecks: [] as Array<{ orderNumber: string; phone: string }>,
    enqueued: [] as Array<Record<string, unknown>>,
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
      calls.repairLinks.push({ repairId, headerId });
    },
    async stageOrder(_orgId, lines, idempotencyKey) {
      calls.staged.push({ count: lines.length, idempotencyKey });
      if (opts.stageThrows) throw opts.stageThrows;
      return opts.stageReturns === undefined
        ? { providerOrderId: 'sq-new', totalCents: 2000 }
        : opts.stageReturns;
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

test('repair-only: a repair is created and linked, nothing is staged', async () => {
  const { deps, calls } = fakes();

  const res = await submitCounterTransaction(input({ services: [service()] }), ORG, deps);

  assert.equal(res.repairs[0]?.id, 321);
  assert.equal(res.repairs[0]?.rsNumber, 'RS-1001');
  assert.equal(res.sale, null);
  assert.deepEqual(calls.staged, [], 'no retail lines means no provider order');
  assert.deepEqual(calls.repairLinks, [{ repairId: 321, headerId: 900 }]);
  assert.equal(res.status, 'staged');
  assert.equal(res.totalCents, 13000);
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

test('combined: both halves persist against one header', async () => {
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
  // Silently dropping the repair the customer came in for, while charging them
  // for headphones, is worse than a 400.
  //
  // Now driven by REAL invalid input rather than an injected throw: the check
  // moved above the first write (SQ6 pre-flight), so this asserts the product
  // rule at the boundary that actually enforces it.
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
  // Reaching this arm means the shared rule and the intake path disagree — a
  // bug in the pre-flight. Throwing here would leave an orphan header holding
  // the visit's client_event_id while the customer's other device is already
  // recorded, so it warns and stays reconcilable instead.
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
  const { deps } = fakes({ stageReturns: null });
  const res = await submitCounterTransaction(input({ retailLines: [line()] }), ORG, deps);
  assert.equal(res.sale, null);
  assert.ok(res.warnings.some((w) => /provider is connected/i.test(w)));
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
  // The bug this pins: validating inside the write loop made the outcome depend
  // on cart order. [invalid, valid] threw after insertHeader, so an orphan
  // header owned the visit's client_event_id forever and the retry returned
  // "unchanged" — the valid device was never recorded at all.
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
