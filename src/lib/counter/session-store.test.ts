/**
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     --test src/lib/counter/session-store.test.ts
 *
 * P2 of `docs/todo/kiosk-desk-session-channel-PLAN.md`, with zero DB: a fake
 * `CounterSessionDeps` holds the session in memory and honours the same
 * conditional-bump contract the real SQL does, so the verb set, the D5 door,
 * and the D3 conflict path are all exercised here rather than against Postgres.
 *
 * The two things worth breaking a build over:
 *   1. the kiosk door is THREE verbs wide — every line write must 403 there;
 *   2. a lost version race returns the CURRENT snapshot, never a partial write.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  addLine,
  getSessionForDevice,
  listClaimedDeviceIds,
  resolveTerminalCheckout,
  startTerminalCheckout,
  submitBlocker,
  submitSession,
  type SubmitSessionOutcome,
  claimSession,
  COUNTER_SESSION_ERROR_STATUS,
  createSession,
  DEFAULT_CLAIM_LEASE_MS,
  getSession,
  holdsLease,
  releaseSession,
  setSessionStatus,
  signLine,
  updateLine,
  voidLine,
  type CounterSessionActor,
  type CounterSessionDeps,
  type CounterSessionResult,
  type CounterSessionTx,
  type HeaderPatch,
  type LinePatch,
  type NewLineInput,
} from './session-store';
import {
  emptySessionSnapshot,
  projectForDevicePrincipal,
  type CounterSessionLine,
  type CounterSessionSnapshot,
} from './session-events';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;
const SESSION_ID = 7;
const DESK: CounterSessionActor = { kind: 'desk', staffId: 11 };
const OTHER_DESK: CounterSessionActor = { kind: 'desk', staffId: 22 };
const KIOSK: CounterSessionActor = { kind: 'kiosk', deviceId: 3 };
const TX = { __fake: true } as const satisfies CounterSessionTx;

const NOW = 1_700_000_000_000;

interface Fake {
  deps: CounterSessionDeps;
  state: CounterSessionSnapshot;
  /** Every CounterTransactionInput the orchestrator was handed. */
  submitted: Array<{ customer: { phone: string }; retailLines?: unknown[]; clientEventId: string }>;
  terminalCalls: Array<{ deviceId: string; orderId: string; idempotencyKey: string }>;
  stagedOrderId: string | null;
  terminalOk: boolean;
  /** Simulates another writer landing between our read and our bump. */
  raceOnNextBump: () => void;
  bumps: number;
}

function fakeDeps(overrides: Partial<CounterSessionSnapshot> = {}): Fake {
  const fake: Fake = {
    state: { ...emptySessionSnapshot(SESSION_ID), ...overrides },
    submitted: [],
    terminalCalls: [],
    stagedOrderId: 'sq-order-1',
    terminalOk: true,
    bumps: 0,
    raceOnNextBump: () => {
      raced = true;
    },
    deps: null as unknown as CounterSessionDeps,
  };
  let raced = false;
  let racerVersionBump = false;
  let nextId = 100;

  fake.deps = {
    async runInTransaction(_orgId, fn) {
      // The fake rolls back on a throw, because the real one does
      // (withTenantTransaction issues ROLLBACK in its catch). A fake that
      // committed through a throw would have hidden the exact bug the P6
      // two-device spec caught: a line written, then reported as not written.
      const before = JSON.parse(JSON.stringify(fake.state)) as CounterSessionSnapshot;
      try {
        return await fn(TX);
      } catch (err) {
        fake.state = racerVersionBump
          ? { ...before, version: before.version + 1 }
          : before;
        racerVersionBump = false;
        throw err;
      }
    },
    async readSnapshot(_tx, _orgId, sessionId) {
      if (sessionId !== fake.state.sessionId) return null;
      return JSON.parse(JSON.stringify(fake.state)) as CounterSessionSnapshot;
    },
    async insertSession(_tx, _orgId, args) {
      const id = nextId++;
      fake.state = {
        ...emptySessionSnapshot(id),
        claimedByStaffId: args.claimedByStaffId,
        kioskDeviceId: args.kioskDeviceId,
      };
      return id;
    },
    async bumpVersion(_tx, _orgId, _sessionId, expected) {
      // Mirrors `WHERE version = $expected` — a racer that moved first wins.
      if (raced) {
        // The racer's write landed and committed before ours — it is not part
        // of our transaction, so it must survive our rollback.
        raced = false;
        racerVersionBump = true;
        return null;
      }
      if (fake.state.version !== expected) return null;
      fake.bumps += 1;
      fake.state = { ...fake.state, version: fake.state.version + 1 };
      return fake.state.version;
    },
    async patchHeader(_tx, _orgId, _sessionId, patch: HeaderPatch) {
      const next = { ...fake.state };
      if ('claimedByStaffId' in patch) next.claimedByStaffId = patch.claimedByStaffId ?? null;
      if ('claimExpiresAtMs' in patch) next.claimExpiresAtMs = patch.claimExpiresAtMs ?? null;
      if ('kioskDeviceId' in patch) next.kioskDeviceId = patch.kioskDeviceId ?? null;
      if (patch.status) next.status = patch.status;
      if (patch.activeCommand) next.activeCommand = patch.activeCommand;
      if (patch.face) next.face = patch.face;
      if (patch.customer) next.customer = { ...patch.customer };
      if (patch.counterTransactionId !== undefined) {
        next.counterTransactionId = patch.counterTransactionId;
      }
      if (patch.paymentState !== undefined) next.paymentState = patch.paymentState;
      if (patch.terminalCheckoutId !== undefined) {
        next.terminalCheckoutId = patch.terminalCheckoutId;
      }
      if (patch.awaitingCardSinceMs !== undefined) {
        next.awaitingCardSinceMs = patch.awaitingCardSinceMs;
      }
      fake.state = next;
    },
    async insertLine(_tx, _orgId, _sessionId, input: NewLineInput) {
      const line: CounterSessionLine = {
        id: input.lineUuid,
        type: input.type,
        title: input.title,
        quantity: input.quantity,
        unitAmountCents: input.unitAmountCents,
        payload: input.payload,
        sortIndex: input.sortIndex,
        voidedAtMs: null,
        voidReason: null,
        voidedByStaffId: null,
      };
      fake.state = { ...fake.state, lines: [...fake.state.lines, line] };
    },
    async listClaimedDeviceIds(_tx, _orgId, staffId) {
      const live =
        fake.state.claimExpiresAtMs === null || (fake.state.claimExpiresAtMs ?? 0) > NOW;
      const held =
        fake.state.status === 'open' &&
        fake.state.claimedByStaffId === staffId &&
        fake.state.kioskDeviceId !== null &&
        live;
      return held ? [fake.state.kioskDeviceId as number] : [];
    },
    async findOpenSessionIdForDevice(_tx, _orgId, deviceId) {
      // Mirrors ux_counter_sessions_open_device: at most one open session per
      // bound device, so the tablet never has to be told a session id.
      if (fake.state.status !== 'open') return null;
      return fake.state.kioskDeviceId === deviceId ? fake.state.sessionId : null;
    },
    async patchLine(_tx, _orgId, _sessionId, lineUuid, patch: LinePatch) {
      let hit = false;
      fake.state = {
        ...fake.state,
        lines: fake.state.lines.map((l) => {
          if (l.id !== lineUuid) return l;
          hit = true;
          return {
            ...l,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
            ...(patch.unitAmountCents !== undefined
              ? { unitAmountCents: patch.unitAmountCents }
              : {}),
            ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
            ...(patch.voidedAtMs !== undefined ? { voidedAtMs: patch.voidedAtMs } : {}),
            ...(patch.voidReason !== undefined ? { voidReason: patch.voidReason } : {}),
            ...(patch.voidedByStaffId !== undefined
              ? { voidedByStaffId: patch.voidedByStaffId }
              : {}),
          };
        }),
      };
      return hit;
    },
    async readStagedOrderId() {
      return fake.stagedOrderId;
    },
    startTerminal: async (_orgId, req) => {
      fake.terminalCalls.push(req);
      return fake.terminalOk
        ? { ok: true as const, checkoutId: 'chk-1' }
        : { ok: false as const, error: 'Square declined the request.' };
    },
    async findSessionIdByCheckout(_tx, _orgId, checkoutId) {
      return checkoutId === 'chk-1' ? fake.state.sessionId : null;
    },
    newIdempotencyKey: () => 'idem-1',
    async readClientEventId() {
      return 'ce000000-0000-4000-8000-000000000001';
    },
    submitTransaction: async (input) => {
      fake.submitted.push(input);
      return {
        counterTransactionId: 900,
        status: 'staged',
        customerId: 5,
        priorOrderRef: null,
        repair: null,
        sale: null,
        ticketWork: { queued: false, outboxId: null, supportTicketId: null },
        idempotentReplay: false,
        subtotalCents: 0,
        totalCents: 0,
        warnings: [],
      };
    },
    now: () => NOW,
  };

  return fake;
}

function retailLine(overrides: Partial<NewLineInput> = {}): NewLineInput {
  return {
    lineUuid: '11111111-1111-4111-8111-111111111111',
    type: 'RETAIL',
    title: 'Case',
    quantity: 1,
    unitAmountCents: 1999,
    payload: { variationId: 'v1', sku: 'CASE-1' },
    sortIndex: 0,
    ...overrides,
  };
}

function retailSessionLine(): CounterSessionLine {
  return {
    id: 'srv-retail',
    type: 'RETAIL',
    title: 'Case',
    quantity: 1,
    unitAmountCents: 1999,
    payload: { variationId: null, sku: 'CASE-1' },
    sortIndex: 0,
    voidedAtMs: null,
    voidReason: null,
    voidedByStaffId: null,
  };
}

function repairSessionLine(): CounterSessionLine {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'REPAIR',
    title: 'QC35 II',
    quantity: 1,
    unitAmountCents: 13000,
    payload: { productModel: 'QC35 II', serialNumber: 'SN1', price: '130', signatureDataUrl: null },
    sortIndex: 1,
    voidedAtMs: null,
    voidReason: null,
    voidedByStaffId: null,
  };
}

function refusal(result: CounterSessionResult): string | null {
  return result.ok ? null : result.code;
}

describe('the money boundary (D5, revised 2026-08-20)', () => {
  it('lets the tablet stage a line — the customer describing what they brought in', async () => {
    const f = fakeDeps();
    const result = await addLine(
      ORG,
      KIOSK,
      SESSION_ID,
      { expectedVersion: 0, line: retailLine({ unitAmountCents: 0 }) },
      f.deps,
    );

    assert.equal(result.ok, true, 'the counter is a form two people fill at once');
    assert.equal(f.state.lines.length, 1);
    assert.equal(result.ok && result.event.actor, 'kiosk', 'the event names who wrote it');
  });

  it('refuses a PRICED line from the tablet — a device that can price can price at zero', async () => {
    const f = fakeDeps();
    const result = await addLine(
      ORG,
      KIOSK,
      SESSION_ID,
      { expectedVersion: 0, line: retailLine({ unitAmountCents: 4999 }) },
      f.deps,
    );

    assert.equal(refusal(result), 'DEVICE_FORBIDDEN');
    assert.equal(f.state.lines.length, 0);
  });

  it('lets the tablet correct its own line — serial, model, quantity', async () => {
    const f = fakeDeps({ lines: [repairSessionLine()] });
    const result = await updateLine(
      ORG,
      KIOSK,
      SESSION_ID,
      repairSessionLine().id,
      { expectedVersion: 0, patch: { quantity: 2, title: 'QC35 II (corrected)' } },
      f.deps,
    );

    assert.equal(result.ok, true);
    assert.equal(f.state.lines[0].quantity, 2);
  });

  it('refuses an AMOUNT in that same patch — the boundary is the field, not the verb', async () => {
    const f = fakeDeps({ lines: [repairSessionLine()] });
    const result = await updateLine(
      ORG,
      KIOSK,
      SESSION_ID,
      repairSessionLine().id,
      { expectedVersion: 0, patch: { quantity: 2, unitAmountCents: 0 } },
      f.deps,
    );

    assert.equal(refusal(result), 'DEVICE_FORBIDDEN');
    assert.equal(f.state.lines[0].quantity, 1, 'and the harmless half is refused with it');
  });

  it('keeps void, claim, park and submit staff-only', async () => {
    const f = fakeDeps({ lines: [repairSessionLine()] });
    const args = { expectedVersion: 0 };

    assert.equal(
      refusal(await voidLine(ORG, KIOSK, SESSION_ID, 'x', { ...args, reason: null }, f.deps)),
      'DEVICE_FORBIDDEN',
    );
    assert.equal(
      refusal(await claimSession(ORG, KIOSK, SESSION_ID, { ...args, staffName: 'x' }, f.deps)),
      'DEVICE_FORBIDDEN',
    );
    assert.equal(
      refusal(await setSessionStatus(ORG, KIOSK, SESSION_ID, { ...args, status: 'parked' }, f.deps)),
      'DEVICE_FORBIDDEN',
    );
    assert.equal(refusal(await createSession(ORG, KIOSK, { clientEventId: 'c' }, f.deps)), 'DEVICE_FORBIDDEN');
  });

  it('still refuses a DESK signature — that one runs toward the tablet', async () => {
    const f = fakeDeps({ lines: [repairSessionLine()] });
    const result = await signLine(
      ORG,
      DESK,
      SESSION_ID,
      repairSessionLine().id,
      { expectedVersion: 0, signatureDataUrl: 'data:image/png;base64,AAA' },
      f.deps,
    );
    assert.equal(refusal(result), 'DEVICE_FORBIDDEN');
  });

  it('refuses a signature on a non-repair line', async () => {
    const f = fakeDeps();
    await addLine(ORG, DESK, SESSION_ID, { expectedVersion: 0, line: retailLine() }, f.deps);
    const result = await signLine(
      ORG,
      KIOSK,
      SESSION_ID,
      retailLine().lineUuid,
      { expectedVersion: 1, signatureDataUrl: 'data:image/png;base64,AAA' },
      f.deps,
    );
    assert.equal(refusal(result), 'LINE_NOT_REPAIR');
    assert.equal(COUNTER_SESSION_ERROR_STATUS.LINE_NOT_REPAIR, 422);
  });
});

describe('submit (P8)', () => {
  function ready() {
    return fakeDeps({
      lines: [retailSessionLine()],
      customer: { phone: '5551234567', name: 'Dana', email: '' },
    });
  }

  it('refuses an empty cart, a missing phone, and an unsigned repair — in that order', () => {
    const empty = { ...emptySessionSnapshot(1), lines: [] };
    assert.equal(submitBlocker(empty), 'EMPTY_CART');

    const noPhone = { ...emptySessionSnapshot(1), lines: [retailSessionLine()] };
    assert.equal(submitBlocker(noPhone), 'MISSING_CUSTOMER');

    const unsigned = {
      ...emptySessionSnapshot(1),
      lines: [repairSessionLine()],
      customer: { phone: '5551234567', name: 'Dana', email: '' },
    };
    assert.equal(
      submitBlocker(unsigned),
      'UNSIGNED_REPAIR',
      'a repair is a legal agreement about someone else’s property',
    );

    const ok = {
      ...emptySessionSnapshot(1),
      lines: [retailSessionLine()],
      customer: { phone: '5551234567', name: 'Dana', email: '' },
    };
    assert.equal(submitBlocker(ok), null);
  });

  it('a cart of only VOIDED lines is empty, not submittable', () => {
    const snapshot = {
      ...emptySessionSnapshot(1),
      lines: [{ ...retailSessionLine(), voidedAtMs: 1 }],
      customer: { phone: '5551234567', name: 'Dana', email: '' },
    };
    assert.equal(submitBlocker(snapshot), 'EMPTY_CART');
  });

  it('composes the orchestrator with the SESSION’s client_event_id (D8)', async () => {
    const f = ready();
    const result = await submitSession(ORG, DESK, SESSION_ID, { expectedVersion: 0 }, f.deps);

    assert.equal(result.ok, true);
    const outcome: SubmitSessionOutcome | undefined = result.outcome;
    assert.equal(outcome?.transaction.counterTransactionId, 900);
    assert.equal(f.submitted.length, 1, 'exactly one transaction');
    assert.equal(f.submitted[0].clientEventId, 'ce000000-0000-4000-8000-000000000001');
    assert.equal(f.submitted[0].customer.phone, '5551234567');
    assert.equal(f.state.status, 'submitted');
    assert.equal(f.state.counterTransactionId, 900);
    assert.equal(result.ok && result.event.type, 'session.submitted');
  });

  it('will not submit twice — a submitted session is closed to everything', async () => {
    const f = ready();
    await submitSession(ORG, DESK, SESSION_ID, { expectedVersion: 0 }, f.deps);
    const again = await submitSession(ORG, DESK, SESSION_ID, { expectedVersion: 1 }, f.deps);

    assert.equal(refusal(again), 'SESSION_CLOSED');
    assert.equal(f.submitted.length, 1, 'the second attempt never reached the orchestrator');
  });

  it('does not hand voided lines to the orchestrator', async () => {
    const f = fakeDeps({
      lines: [retailSessionLine(), { ...retailSessionLine(), id: 'void-me', voidedAtMs: 1 }],
      customer: { phone: '5551234567', name: 'Dana', email: '' },
    });
    await submitSession(ORG, DESK, SESSION_ID, { expectedVersion: 0 }, f.deps);
    assert.equal((f.submitted[0].retailLines as unknown[]).length, 1);
  });
});

describe('version discipline (D3)', () => {
  it('every accepted mutation bumps by exactly one and emits that version', async () => {
    const f = fakeDeps();
    const added = await addLine(ORG, DESK, SESSION_ID, { expectedVersion: 0, line: retailLine() }, f.deps);

    assert.equal(added.ok, true);
    assert.equal(added.ok && added.snapshot.version, 1);
    assert.equal(added.ok && added.event.version, 1);
    assert.equal(added.ok && added.event.type, 'line.added');
  });

  it('a stale expectedVersion is refused with the CURRENT snapshot', async () => {
    const f = fakeDeps();
    await addLine(ORG, DESK, SESSION_ID, { expectedVersion: 0, line: retailLine() }, f.deps);

    const stale = await addLine(
      ORG,
      DESK,
      SESSION_ID,
      { expectedVersion: 0, line: retailLine({ lineUuid: '33333333-3333-4333-8333-333333333333' }) },
      f.deps,
    );
    assert.equal(refusal(stale), 'VERSION_CONFLICT');
    assert.equal(stale.snapshot?.version, 1, 'the caller renders the truth, not its stale echo');
    assert.equal(COUNTER_SESSION_ERROR_STATUS.VERSION_CONFLICT, 409);
  });

  it('a writer that loses the race gets the racer’s snapshot back — and writes NOTHING', async () => {
    const f = fakeDeps();
    f.raceOnNextBump();

    const result = await addLine(ORG, DESK, SESSION_ID, { expectedVersion: 0, line: retailLine() }, f.deps);
    assert.equal(refusal(result), 'VERSION_CONFLICT');
    assert.equal(result.snapshot?.version, 1);
    assert.equal(f.bumps, 0);
    // The line must be GONE. Reporting a conflict while committing the write
    // hands the caller a snapshot containing the line it was just told was not
    // written (found by the P6 spec, 2026-08-20).
    assert.deepEqual(f.state.lines, [], 'a lost race rolls its write back');
  });

  it('refuses a mutation on a parked session, but not the resume itself', async () => {
    const f = fakeDeps({ status: 'parked' });

    const blocked = await addLine(ORG, DESK, SESSION_ID, { expectedVersion: 0, line: retailLine() }, f.deps);
    assert.equal(refusal(blocked), 'SESSION_CLOSED');

    const resumed = await setSessionStatus(ORG, DESK, SESSION_ID, { expectedVersion: 0, status: 'open' }, f.deps);
    assert.equal(resumed.ok, true);
    assert.equal(f.state.status, 'open');
  });

  it('treats a submitted session as terminal — unwinding a charge is a refund, not an edit', async () => {
    const f = fakeDeps({ status: 'submitted' });
    const result = await setSessionStatus(ORG, DESK, SESSION_ID, { expectedVersion: 0, status: 'open' }, f.deps);
    assert.equal(refusal(result), 'SESSION_CLOSED');
  });

  it('reports a missing session as NOT_FOUND without inventing a snapshot', async () => {
    const f = fakeDeps();
    const result = await addLine(ORG, DESK, 999, { expectedVersion: 0, line: retailLine() }, f.deps);
    assert.equal(refusal(result), 'NOT_FOUND');
    assert.equal(result.snapshot, null);
    assert.equal(COUNTER_SESSION_ERROR_STATUS.NOT_FOUND, 404);
  });
});

describe('the lease (D4)', () => {
  it('claims an unheld session and stamps the expiry', async () => {
    const f = fakeDeps();
    const result = await claimSession(ORG, DESK, SESSION_ID, { expectedVersion: 0, staffName: 'Ari' }, f.deps);

    assert.equal(result.ok, true);
    assert.equal(f.state.claimedByStaffId, 11);
    assert.equal(f.state.claimExpiresAtMs, NOW + DEFAULT_CLAIM_LEASE_MS);
    assert.equal(result.ok && result.event.type, 'session.claimed');
  });

  it('refuses a second desk unless it says takeover', async () => {
    const f = fakeDeps({ claimedByStaffId: 11, claimExpiresAtMs: NOW + 60_000 });

    const blocked = await claimSession(ORG, OTHER_DESK, SESSION_ID, { expectedVersion: 0, staffName: 'Bo' }, f.deps);
    assert.equal(refusal(blocked), 'CLAIMED_BY_OTHER');
    assert.equal(f.state.claimedByStaffId, 11);

    const forced = await claimSession(
      ORG,
      OTHER_DESK,
      SESSION_ID,
      { expectedVersion: 0, staffName: 'Bo', takeover: true },
      f.deps,
    );
    assert.equal(forced.ok, true);
    assert.equal(f.state.claimedByStaffId, 22);
  });

  it('an EXPIRED lease is not a lease — the next staffer waits on a timeout, not a human', async () => {
    const f = fakeDeps({ claimedByStaffId: 11, claimExpiresAtMs: NOW - 1 });
    const result = await claimSession(ORG, OTHER_DESK, SESSION_ID, { expectedVersion: 0, staffName: 'Bo' }, f.deps);

    assert.equal(result.ok, true, 'no takeover flag needed once the lease has lapsed');
    assert.equal(holdsLease(f.state, 22, NOW), true);
    assert.equal(holdsLease({ ...f.state, claimExpiresAtMs: NOW - 1 }, 22, NOW), false);
  });

  it('renewing your own live lease is always allowed', async () => {
    const f = fakeDeps({ claimedByStaffId: 11, claimExpiresAtMs: NOW + 1_000 });
    const result = await claimSession(ORG, DESK, SESSION_ID, { expectedVersion: 0, staffName: 'Ari' }, f.deps);
    assert.equal(result.ok, true);
    assert.equal(f.state.claimExpiresAtMs, NOW + DEFAULT_CLAIM_LEASE_MS);
  });

  it('releases a parked session’s lease too', async () => {
    const f = fakeDeps({ status: 'parked', claimedByStaffId: 11, claimExpiresAtMs: NOW + 1_000 });
    const result = await releaseSession(ORG, DESK, SESSION_ID, { expectedVersion: 0, reason: 'done' }, f.deps);

    assert.equal(result.ok, true);
    assert.equal(f.state.claimedByStaffId, null);
    assert.equal(f.state.claimExpiresAtMs, null);
  });
});

describe('line writes from the desk', () => {
  it('voids softly, keeping who and why', async () => {
    const f = fakeDeps({ lines: [repairSessionLine()] });
    const result = await voidLine(
      ORG,
      DESK,
      SESSION_ID,
      repairSessionLine().id,
      { expectedVersion: 0, reason: 'wrong item' },
      f.deps,
    );

    assert.equal(result.ok, true);
    assert.equal(f.state.lines.length, 1, 'evidence, not a delete');
    assert.equal(f.state.lines[0].voidedAtMs, NOW);
    assert.equal(f.state.lines[0].voidReason, 'wrong item');
    assert.equal(f.state.lines[0].voidedByStaffId, 11);
    assert.equal(projectForDevicePrincipal(f.state).lines.length, 0, 'and gone from the customer face');
  });

  it('reports an unknown line without bumping the version', async () => {
    const f = fakeDeps();
    const result = await voidLine(ORG, DESK, SESSION_ID, 'not-here', { expectedVersion: 0, reason: null }, f.deps);

    assert.equal(refusal(result), 'LINE_NOT_FOUND');
    assert.equal(f.bumps, 0);
    assert.equal(f.state.version, 0);
  });

  it('keeps a buyback credit negative through the write', async () => {
    const f = fakeDeps();
    await addLine(
      ORG,
      DESK,
      SESSION_ID,
      {
        expectedVersion: 0,
        line: retailLine({
          lineUuid: '44444444-4444-4444-8444-444444444444',
          type: 'BUYBACK',
          title: 'iPhone 12',
          unitAmountCents: -22000,
          payload: { imei: '990001112223334' },
        }),
      },
      f.deps,
    );
    assert.equal(f.state.lines[0].unitAmountCents, -22000);
  });

  it('reads back through getSession', async () => {
    const f = fakeDeps();
    await addLine(ORG, DESK, SESSION_ID, { expectedVersion: 0, line: retailLine() }, f.deps);
    const snapshot = await getSession(ORG, SESSION_ID, f.deps);
    assert.equal(snapshot?.version, 1);
    assert.equal(snapshot?.lines.length, 1);
    assert.equal(await getSession(ORG, 999, f.deps), null);
  });
});

describe('getSessionForDevice — the tablet never learns a session id', () => {
  it('resolves the open session bound to this device', async () => {
    const f = fakeDeps({ kioskDeviceId: 3, lines: [repairSessionLine()] });
    const snapshot = await getSessionForDevice(ORG, 3, f.deps);
    assert.equal(snapshot?.sessionId, SESSION_ID);
  });

  it('returns null for a device bound to nothing — its idle state, not an error', async () => {
    const f = fakeDeps({ kioskDeviceId: 3 });
    assert.equal(await getSessionForDevice(ORG, 99, f.deps), null);
  });

  it('returns null once the session is parked — a parked cart is not on display', async () => {
    const f = fakeDeps({ kioskDeviceId: 3, status: 'parked' });
    assert.equal(await getSessionForDevice(ORG, 3, f.deps), null);
  });
});

describe('listClaimedDeviceIds — what the desk may listen to (P3)', () => {
  it('names the device this desk holds', async () => {
    const f = fakeDeps({ kioskDeviceId: 3, claimedByStaffId: 11, claimExpiresAtMs: NOW + 60_000 });
    assert.deepEqual(await listClaimedDeviceIds(ORG, 11, f.deps), [3]);
  });

  it('names nothing for a desk holding no lease', async () => {
    const f = fakeDeps({ kioskDeviceId: 3, claimedByStaffId: 11, claimExpiresAtMs: NOW + 60_000 });
    assert.deepEqual(await listClaimedDeviceIds(ORG, 22, f.deps), []);
  });

  it('drops an EXPIRED lease — walking away stops the traffic at the next mint', async () => {
    const f = fakeDeps({ kioskDeviceId: 3, claimedByStaffId: 11, claimExpiresAtMs: NOW - 1 });
    assert.deepEqual(await listClaimedDeviceIds(ORG, 11, f.deps), []);
  });
});

describe('createSession', () => {
  it('opens a desk-claimed session bound to a device and returns a snapshot event', async () => {
    const f = fakeDeps();
    const result = await createSession(
      ORG,
      DESK,
      { clientEventId: '55555555-5555-4555-8555-555555555555', kioskDeviceId: 3 },
      f.deps,
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.event.type, 'session.snapshot');
    assert.equal(f.state.claimedByStaffId, 11);
    assert.equal(f.state.kioskDeviceId, 3);
    assert.equal(f.state.version, 0);
  });
});

describe('card present (SQ2)', () => {
  function submitted(overrides: Partial<CounterSessionSnapshot> = {}) {
    return fakeDeps({ status: 'submitted', counterTransactionId: 900, ...overrides });
  }

  it('sends the STAGED order to the stand and puts both faces on "present card"', async () => {
    const f = submitted();
    const result = await startTerminalCheckout(
      ORG,
      DESK,
      SESSION_ID,
      { expectedVersion: 0, deviceId: 'dev-A' },
      f.deps,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(f.terminalCalls, [
      { deviceId: 'dev-A', orderId: 'sq-order-1', idempotencyKey: 'idem-1' },
    ]);
    assert.equal(f.state.paymentState, 'awaiting_card');
    assert.equal(f.state.terminalCheckoutId, 'chk-1');
    assert.equal(f.state.awaitingCardSinceMs, NOW);
    assert.equal(result.ok && result.event.type, 'session.payment_changed');
  });

  it('refuses before submit — there is no staged order to collect against', async () => {
    const f = fakeDeps({ status: 'open' });
    const result = await startTerminalCheckout(
      ORG, DESK, SESSION_ID, { expectedVersion: 0, deviceId: 'dev-A' }, f.deps,
    );
    assert.equal(refusal(result), 'NOT_SUBMITTED');
    assert.deepEqual(f.terminalCalls, [], 'the stand is never asked');
  });

  it('refuses a second prompt while one is live — that is how a card gets charged twice', async () => {
    const f = submitted({ paymentState: 'awaiting_card' });
    const result = await startTerminalCheckout(
      ORG, DESK, SESSION_ID, { expectedVersion: 0, deviceId: 'dev-A' }, f.deps,
    );
    assert.equal(refusal(result), 'ALREADY_AWAITING_CARD');
    assert.deepEqual(f.terminalCalls, []);
  });

  it('refuses when nothing was staged (repair-only visit, or no provider)', async () => {
    const f = submitted();
    f.stagedOrderId = null;
    const result = await startTerminalCheckout(
      ORG, DESK, SESSION_ID, { expectedVersion: 0, deviceId: 'dev-A' }, f.deps,
    );
    assert.equal(refusal(result), 'NO_STAGED_ORDER');
  });

  it('reports a Square refusal as 502 and writes nothing', async () => {
    const f = submitted();
    f.terminalOk = false;
    const result = await startTerminalCheckout(
      ORG, DESK, SESSION_ID, { expectedVersion: 0, deviceId: 'dev-A' }, f.deps,
    );
    assert.equal(refusal(result), 'TERMINAL_REFUSED');
    assert.equal(COUNTER_SESSION_ERROR_STATUS.TERMINAL_REFUSED, 502);
    assert.equal(f.state.paymentState, 'idle');
    assert.equal(f.bumps, 0, 'a refused checkout does not move the version');
  });

  it('is desk-only — a tablet must not summon a card prompt', async () => {
    const f = submitted();
    const result = await startTerminalCheckout(
      ORG, KIOSK, SESSION_ID, { expectedVersion: 0, deviceId: 'dev-A' }, f.deps,
    );
    assert.equal(refusal(result), 'DEVICE_FORBIDDEN');
    assert.deepEqual(f.terminalCalls, []);
  });

  it('lands an approval on the session and takes the prompt down', async () => {
    const f = submitted({ paymentState: 'awaiting_card', terminalCheckoutId: 'chk-1', awaitingCardSinceMs: NOW });
    const out = await resolveTerminalCheckout(ORG, { checkoutId: 'chk-1', paymentState: 'approved' }, f.deps);

    assert.equal(out.resolved, true);
    assert.equal(f.state.paymentState, 'approved');
    assert.equal(f.state.awaitingCardSinceMs, null);
    assert.equal(
      f.state.status,
      'submitted',
      'a device approval is NOT the money — counter_transactions.status is SQ1’s job',
    );
  });

  it('never reopens a settled prompt on a redelivered webhook', async () => {
    const f = submitted({ paymentState: 'approved', terminalCheckoutId: 'chk-1' });
    await resolveTerminalCheckout(ORG, { checkoutId: 'chk-1', paymentState: 'awaiting_card' }, f.deps);
    assert.equal(f.state.paymentState, 'approved');
  });

  it('ignores a checkout this deployment did not start', async () => {
    const f = submitted({ paymentState: 'awaiting_card', terminalCheckoutId: 'chk-1' });
    const out = await resolveTerminalCheckout(ORG, { checkoutId: 'chk-other', paymentState: 'approved' }, f.deps);
    assert.equal(out.resolved, false);
    assert.equal(f.state.paymentState, 'awaiting_card');
  });

  it('a decline leaves the cart intact so it can be retried', async () => {
    const f = submitted({ paymentState: 'awaiting_card', terminalCheckoutId: 'chk-1', lines: [retailSessionLine()] });
    await resolveTerminalCheckout(ORG, { checkoutId: 'chk-1', paymentState: 'declined' }, f.deps);

    assert.equal(f.state.paymentState, 'declined');
    assert.equal(f.state.lines.length, 1);
  });
});
