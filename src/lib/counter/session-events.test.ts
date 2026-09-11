/**
 *   npx tsx --test src/lib/counter/session-events.test.ts
 *
 * P0 of `docs/todo/kiosk-desk-session-channel-PLAN.md`. Two invariants carry the
 * whole design and are tested hardest here:
 *
 *   1. the reducer is order-insensitive (it converges or refuses — never both);
 *   2. the device projection leaks nothing, asserted field-by-field rather than
 *      against a snapshot blob, because a blob assertion passes happily when a
 *      new leaky field is added to the source type.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applySessionEvent,
  COUNTER_SESSION_EVENTS,
  COUNTER_SESSION_STATUSES,
  EMPTY_CUSTOMER,
  emptySessionSnapshot,
  isCounterSessionStatus,
  maskPhone,
  needsResync,
  nextVersion,
  projectForDevicePrincipal,
  type ApplySessionEventResult,
  type CounterSessionActor,
  type CounterSessionEvent,
  type CounterSessionLine,
  type CounterSessionRefusal,
  type CounterSessionSnapshot,
  type DeviceSessionProjection,
} from './session-events';
import { computeKioskCartTotals, isRepairPayload, isRetailPayload } from '@/lib/kiosk/cart-line';

const SESSION_ID = 42;

function line(overrides: Partial<CounterSessionLine> = {}): CounterSessionLine {
  return {
    id: 'r1',
    type: 'RETAIL',
    title: 'Case',
    quantity: 1,
    unitAmountCents: 1999,
    payload: { variationId: 'v-internal', sku: 'CASE-1' },
    sortIndex: 0,
    voidedAtMs: null,
    voidReason: null,
    voidedByStaffId: null,
    ...overrides,
  };
}

function repairLine(overrides: Partial<CounterSessionLine> = {}): CounterSessionLine {
  return line({
    id: 's1',
    type: 'REPAIR',
    title: 'QC35 II',
    unitAmountCents: 13000,
    sortIndex: 1,
    payload: {
      productModel: 'QC35 II',
      productType: 'headphones',
      sourceSku: 'INTERNAL-SRC-9',
      serialNumber: 'SN1',
      price: '130',
      passcode: '4821',
      imei: '35911',
      notes: 'customer is a repeat no-show',
      repairNotes: 'left driver rattles',
      repairReasons: ['audio'],
      signatureDataUrl: null,
    },
    ...overrides,
  });
}

function buybackLine(overrides: Partial<CounterSessionLine> = {}): CounterSessionLine {
  return line({
    id: 'b1',
    type: 'BUYBACK',
    title: 'iPhone 12',
    unitAmountCents: -22000,
    sortIndex: 2,
    payload: { imei: '990001112223334', grade: 'B', notes: 'screen scuffed, lowballed' },
    ...overrides,
  });
}

function added(version: number, l: CounterSessionLine): CounterSessionEvent {
  return { type: 'line.added', sessionId: SESSION_ID, version, actor: 'desk', line: l };
}

function fresh(): CounterSessionSnapshot {
  return emptySessionSnapshot(SESSION_ID);
}

/** Apply a run of events, asserting each one lands. Returns the final snapshot. */
function applyAll(
  start: CounterSessionSnapshot,
  events: CounterSessionEvent[],
): CounterSessionSnapshot {
  return events.reduce((snap, event) => {
    const result: ApplySessionEventResult = applySessionEvent(snap, event);
    assert.equal(result.applied, true, `expected ${event.type}@v${event.version} to apply`);
    return result.snapshot;
  }, start);
}

describe('vocabulary exports', () => {
  it('the status list mirrors `counter_sessions_status_chk` exactly', () => {
    assert.deepEqual([...COUNTER_SESSION_STATUSES], ['open', 'parked', 'submitted', 'voided']);
    for (const status of COUNTER_SESSION_STATUSES) {
      assert.equal(isCounterSessionStatus(status), true);
    }
    assert.equal(isCounterSessionStatus('abandoned'), false, 'that is a transaction status, not a session one');
    assert.equal(isCounterSessionStatus(''), false);
  });

  it('the event-name list covers every member of the event union', () => {
    // One name per `type` in CounterSessionEvent. If the union grows and this
    // list does not, a subscriber silently never binds the new event.
    const producible: CounterSessionEvent['type'][] = [
      'session.snapshot',
      'session.claimed',
      'session.device_bound',
      'session.released',
      'line.added',
      'line.updated',
      'line.voided',
      'session.customer_changed',
      'session.command_changed',
      'session.face_changed',
      'session.presentation_changed',
      'session.status_changed',
      'session.submitted',
      'session.payment_changed',
    ];
    assert.deepEqual([...COUNTER_SESSION_EVENTS].sort(), [...producible].sort());
    assert.equal(new Set(COUNTER_SESSION_EVENTS).size, COUNTER_SESSION_EVENTS.length);
  });

  it('a fresh session COPIES the empty customer rather than aliasing it', () => {
    const a = emptySessionSnapshot(1);
    const b = emptySessionSnapshot(2);
    assert.deepEqual(a.customer, EMPTY_CUSTOMER);
    assert.notEqual(a.customer, EMPTY_CUSTOMER, 'aliasing would let one visit edit the module constant');
    assert.notEqual(a.customer, b.customer);
    assert.deepEqual(a.lines, []);
    assert.notEqual(a.lines, b.lines);
  });

  it('an actor is one of exactly three principals', () => {
    const actors: CounterSessionActor[] = ['desk', 'kiosk', 'server'];
    assert.equal(actors.length, 3);
  });
});

describe('applySessionEvent — version discipline', () => {
  it('applies a contiguous run and converges', () => {
    const end = applyAll(fresh(), [
      added(1, line()),
      added(2, repairLine()),
      {
        type: 'session.customer_changed',
        sessionId: SESSION_ID,
        version: 3,
        actor: 'kiosk',
        customer: { phone: '5551234567', name: 'Dana', email: 'd@example.com' },
      },
    ]);

    assert.equal(end.version, 3);
    assert.deepEqual(end.lines.map((l) => l.id), ['r1', 's1']);
    assert.equal(end.customer.name, 'Dana');
  });

  it('refuses a future event as a gap and leaves the snapshot untouched', () => {
    const start = applyAll(fresh(), [added(1, line())]);
    const result = applySessionEvent(start, added(3, repairLine()));

    assert.equal(result.applied, false);
    const reason: CounterSessionRefusal | null = result.applied === false ? result.reason : null;
    assert.equal(reason, 'gap');
    assert.equal(needsResync(result), true);
    // The caller renders result.snapshot either way — it must be the old state.
    assert.equal(result.snapshot, start);
    assert.equal(start.version, 1);
    assert.equal(start.lines.length, 1);
  });

  it('drops a duplicate without advancing the version', () => {
    const start = applyAll(fresh(), [added(1, line())]);
    const result = applySessionEvent(start, added(1, line()));

    assert.equal(result.applied, false);
    assert.equal(result.applied === false && result.reason, 'duplicate');
    assert.equal(needsResync(result), false);
    assert.equal(result.snapshot.version, 1);
    assert.equal(result.snapshot.lines.length, 1);
  });

  it('converges regardless of arrival order — gapped events replay cleanly', () => {
    const inOrder = applyAll(fresh(), [added(1, line()), added(2, repairLine()), added(3, buybackLine())]);

    // Same three events, delivered 1 → 3 → 2. The 3 is refused, then replayed.
    let snap = fresh();
    snap = (applySessionEvent(snap, added(1, line())) as { snapshot: CounterSessionSnapshot }).snapshot;
    const early = applySessionEvent(snap, added(3, buybackLine()));
    assert.equal(early.applied, false);
    snap = early.snapshot;
    snap = (applySessionEvent(snap, added(2, repairLine())) as { snapshot: CounterSessionSnapshot }).snapshot;
    snap = (applySessionEvent(snap, added(3, buybackLine())) as { snapshot: CounterSessionSnapshot }).snapshot;

    assert.deepEqual(snap, inOrder);
  });

  it('refuses an event for another session and never resyncs from it', () => {
    const start = fresh();
    const result = applySessionEvent(start, { ...added(1, line()), sessionId: 999 });

    assert.equal(result.applied, false);
    assert.equal(result.applied === false && result.reason, 'foreign');
    assert.equal(needsResync(result), false);
    assert.equal(result.snapshot, start);
  });

  it('never mutates the input snapshot', () => {
    const start = applyAll(fresh(), [added(1, line())]);
    const before = JSON.stringify(start);
    applySessionEvent(start, added(2, repairLine()));
    assert.equal(JSON.stringify(start), before);
  });

  it('nextVersion names the only acceptable version', () => {
    const start = applyAll(fresh(), [added(1, line())]);
    assert.equal(nextVersion(start), 2);
    assert.equal(applySessionEvent(start, added(nextVersion(start), repairLine())).applied, true);
  });
});

describe('applySessionEvent — snapshot resync', () => {
  it('applies a snapshot regardless of how far ahead it is', () => {
    const start = fresh();
    const server: CounterSessionSnapshot = {
      ...fresh(),
      version: 17,
      lines: [line(), repairLine()],
    };
    const result = applySessionEvent(start, {
      type: 'session.snapshot',
      sessionId: SESSION_ID,
      version: 17,
      actor: 'server',
      snapshot: server,
    });

    assert.equal(result.applied, true);
    assert.equal(result.snapshot.version, 17);
    assert.equal(result.snapshot.lines.length, 2);
    // Cloned, not aliased — a later local edit must not reach back into the event.
    assert.notEqual(result.snapshot.lines, server.lines);
  });

  it('refuses a stale snapshot rather than rolling the session backward', () => {
    const start = applyAll(fresh(), [added(1, line()), added(2, repairLine())]);
    const result = applySessionEvent(start, {
      type: 'session.snapshot',
      sessionId: SESSION_ID,
      version: 1,
      actor: 'server',
      snapshot: { ...fresh(), version: 1, lines: [line()] },
    });

    assert.equal(result.applied, false);
    assert.equal(result.applied === false && result.reason, 'duplicate');
    assert.equal(result.snapshot.version, 2);
    assert.equal(result.snapshot.lines.length, 2);
  });
});

describe('applySessionEvent — line writes', () => {
  it('voids a line in place instead of deleting it', () => {
    const start = applyAll(fresh(), [added(1, line()), added(2, repairLine())]);
    const end = applyAll(start, [
      {
        type: 'line.voided',
        sessionId: SESSION_ID,
        version: 3,
        actor: 'desk',
        lineId: 'r1',
        voidedAtMs: 1_700_000_000_000,
        voidReason: 'wrong item',
        voidedByStaffId: 7,
      },
    ]);

    assert.equal(end.lines.length, 2, 'a voided line stays in the desk ledger');
    const voided = end.lines.find((l) => l.id === 'r1');
    assert.equal(voided?.voidedAtMs, 1_700_000_000_000);
    assert.equal(voided?.voidReason, 'wrong item');
    assert.equal(voided?.voidedByStaffId, 7);
  });

  it('takes the version for an unknown line id — a race must not desync forever', () => {
    const start = applyAll(fresh(), [added(1, line())]);
    const result = applySessionEvent(start, {
      type: 'line.voided',
      sessionId: SESSION_ID,
      version: 2,
      actor: 'desk',
      lineId: 'never-existed',
      voidedAtMs: 1,
      voidReason: null,
      voidedByStaffId: null,
    });

    assert.equal(result.applied, true);
    assert.equal(result.snapshot.version, 2);
    assert.deepEqual(result.snapshot.lines, start.lines);
  });

  it('is idempotent on a re-published add — the total must not double', () => {
    const start = applyAll(fresh(), [added(1, line())]);
    const replay = applySessionEvent(start, added(2, line()));

    assert.equal(replay.applied, true);
    assert.equal(replay.snapshot.lines.length, 1);
    assert.equal(computeKioskCartTotals(replay.snapshot.lines).totalCents, 1999);
  });

  it('keeps lines in sortIndex order however they arrive', () => {
    const end = applyAll(fresh(), [
      added(1, buybackLine()), // sortIndex 2
      added(2, line()), // sortIndex 0
      added(3, repairLine()), // sortIndex 1
    ]);
    assert.deepEqual(end.lines.map((l) => l.id), ['r1', 's1', 'b1']);
  });

  it('carries a buyback credit through as a negative amount', () => {
    const end = applyAll(fresh(), [added(1, line()), added(2, buybackLine())]);
    const projected = projectForDevicePrincipal(end);

    assert.equal(end.lines.find((l) => l.id === 'b1')?.unitAmountCents, -22000);
    assert.equal(projected.lines.find((l) => l.id === 'b1')?.unitAmountCents, -22000);
    // 1999 − 22000: the credit subtracts on the customer's screen too.
    assert.equal(computeKioskCartTotals(projected.lines).totalCents, -20001);
  });
});

describe('applySessionEvent — lease and lifecycle', () => {
  it('records and clears a claim', () => {
    const claimed = applyAll(fresh(), [
      {
        type: 'session.claimed',
        sessionId: SESSION_ID,
        version: 1,
        actor: 'desk',
        staffId: 9,
        staffName: 'Ari',
        claimExpiresAtMs: 5_000,
      },
    ]);
    assert.equal(claimed.claimedByStaffId, 9);
    assert.equal(claimed.claimedByStaffName, 'Ari');
    assert.equal(claimed.claimExpiresAtMs, 5_000);

    const released = applyAll(claimed, [
      { type: 'session.released', sessionId: SESSION_ID, version: 2, actor: 'desk', reason: 'takeover' },
    ]);
    assert.equal(released.claimedByStaffId, null);
    assert.equal(released.claimedByStaffName, null);
    assert.equal(released.claimExpiresAtMs, null);
  });

  it('submission stamps the transaction and the terminal status together', () => {
    const end = applyAll(fresh(), [
      added(1, line()),
      { type: 'session.submitted', sessionId: SESSION_ID, version: 2, actor: 'server', counterTransactionId: 555 },
    ]);
    assert.equal(end.status, 'submitted');
    assert.equal(end.counterTransactionId, 555);
  });

  it('parks and resumes through one status verb', () => {
    const parked = applyAll(fresh(), [
      { type: 'session.status_changed', sessionId: SESSION_ID, version: 1, actor: 'desk', status: 'parked' },
    ]);
    assert.equal(parked.status, 'parked');
    const resumed = applyAll(parked, [
      { type: 'session.status_changed', sessionId: SESSION_ID, version: 2, actor: 'desk', status: 'open' },
    ]);
    assert.equal(resumed.status, 'open');
  });

  it('binds and unbinds a tablet without touching lines', () => {
    const bound = applyAll(fresh(), [
      {
        type: 'session.device_bound',
        sessionId: SESSION_ID,
        version: 1,
        actor: 'desk',
        kioskDeviceId: 3,
      },
    ]);
    assert.equal(bound.kioskDeviceId, 3);
    assert.deepEqual(bound.lines, []);
    const unbound = applyAll(bound, [
      {
        type: 'session.device_bound',
        sessionId: SESSION_ID,
        version: 2,
        actor: 'desk',
        kioskDeviceId: null,
      },
    ]);
    assert.equal(unbound.kioskDeviceId, null);
  });
});

describe('projectForDevicePrincipal — D6 allowlist', () => {
  const staffOnly = applyAll(fresh(), [
    added(1, line()),
    added(2, repairLine()),
    added(3, buybackLine()),
    {
      type: 'session.claimed',
      sessionId: SESSION_ID,
      version: 4,
      actor: 'desk',
      staffId: 9,
      staffName: 'Ari',
      claimExpiresAtMs: 5_000,
    },
    {
      type: 'session.customer_changed',
      sessionId: SESSION_ID,
      version: 5,
      actor: 'desk',
      customer: { phone: '555-123-4567', name: 'Dana', email: 'dana@example.com' },
    },
  ]);

  it('exposes only the declared fields — nothing about staff or the lease', () => {
    const projected: DeviceSessionProjection = projectForDevicePrincipal(staffOnly);
    assert.deepEqual(Object.keys(projected).sort(), [
      'activeCommand',
      'awaitingCardSinceMs',
      'awaitingSignatureLineIds',
      'consultStance',
      'customerName',
      'customerPhoneMasked',
      'face',
      'lines',
      'paymentState',
      'presentation',
      'sessionId',
      'status',
      'version',
    ]);
    const serialized = JSON.stringify(projected);
    assert.equal(serialized.includes('Ari'), false, 'lease holder must not reach the tablet');
    assert.equal(serialized.includes('claim'), false);
    assert.equal(
      'terminalCheckoutId' in projected,
      false,
      'a Square checkout id is a handle into the tenant’s account — not the tablet’s business',
    );
  });

  it('never carries the customer email, and masks the phone to four digits', () => {
    const projected = projectForDevicePrincipal(staffOnly);
    assert.equal(JSON.stringify(projected).includes('dana@example.com'), false);
    assert.equal(projected.customerPhoneMasked, '••• ••• 4567');
    assert.equal(projected.customerName, 'Dana');
  });

  it('strips the repair passcode, internal notes, and sourcing SKU field-by-field', () => {
    const projected = projectForDevicePrincipal(staffOnly);
    const repair = projected.lines.find((l) => l.id === 's1');
    assert.ok(repair && isRepairPayload(repair.payload));
    const payload = repair.payload;
    assert.equal('passcode' in payload, false, 'a passcode on an idle screen is the next stranger\'s');
    assert.equal('notes' in payload, false);
    assert.equal('repairNotes' in payload, false);
    assert.equal('sourceSku' in payload, false);
    assert.equal('imei' in payload, false);
    // …while keeping what the customer must be able to read on the display.
    assert.equal(payload.productModel, 'QC35 II');
    assert.equal(payload.serialNumber, 'SN1');
    assert.equal(payload.price, '130');
    assert.deepEqual(payload.repairReasons, ['audio']);
  });

  it('strips the buyback grade and note, and the retail variation id', () => {
    const projected = projectForDevicePrincipal(staffOnly);
    const buyback = projected.lines.find((l) => l.id === 'b1');
    assert.deepEqual(buyback?.payload, { imei: '990001112223334' });

    const retail = projected.lines.find((l) => l.id === 'r1');
    assert.ok(retail && isRetailPayload(retail.payload));
    assert.equal(retail.payload.variationId, null, 'provider internals are not customer copy');
    assert.equal(retail.payload.sku, 'CASE-1');
  });

  it('drops voided lines entirely — the customer sees the cart, not the correction', () => {
    const voided = applyAll(staffOnly, [
      {
        type: 'line.voided',
        sessionId: SESSION_ID,
        version: 6,
        actor: 'desk',
        lineId: 'r1',
        voidedAtMs: 1,
        voidReason: 'wrong item',
        voidedByStaffId: 7,
      },
    ]);
    const projected = projectForDevicePrincipal(voided);

    assert.equal(voided.lines.length, 3);
    assert.deepEqual(projected.lines.map((l) => l.id), ['s1', 'b1']);
    assert.equal(JSON.stringify(projected).includes('wrong item'), false);
    // The projected total is the total of what is NOT voided — 13000 − 22000.
    assert.equal(computeKioskCartTotals(projected.lines).totalCents, -9000);
  });

  it('names the repair lines still waiting on a signature, and only those', () => {
    const projected = projectForDevicePrincipal(staffOnly);
    assert.deepEqual(projected.awaitingSignatureLineIds, ['s1']);

    const signed = applyAll(staffOnly, [
      {
        type: 'line.updated',
        sessionId: SESSION_ID,
        version: 6,
        actor: 'kiosk',
        line: repairLine({
          payload: {
            productModel: 'QC35 II',
            serialNumber: 'SN1',
            price: '130',
            signatureDataUrl: 'data:image/png;base64,AAA',
          },
        }),
      },
    ]);
    assert.deepEqual(projectForDevicePrincipal(signed).awaitingSignatureLineIds, []);
  });
});

describe('applySessionEvent — consult stance', () => {
  it('flips Show without touching lines', () => {
    const start = applyAll(fresh(), [added(1, line())]);
    const end = applyAll(start, [
      {
        type: 'session.face_changed',
        sessionId: SESSION_ID,
        version: 2,
        actor: 'desk',
        face: 'customer',
        consultStance: 'show',
      },
    ]);
    assert.equal(end.consultStance, 'show');
    assert.equal(end.face, 'customer');
    assert.equal(end.lines.length, 1);
    assert.equal(end.lines[0].title, start.lines[0].title);
    assert.equal(end.activeCommand, start.activeCommand);
  });

  it('recovers Verify from a legacy customer face event', () => {
    const end = applyAll(fresh(), [
      {
        type: 'session.face_changed',
        sessionId: SESSION_ID,
        version: 1,
        actor: 'kiosk',
        face: 'customer',
      },
    ]);
    assert.equal(end.consultStance, 'verify');
    assert.equal(end.face, 'customer');
  });
});

describe('applySessionEvent — presentation', () => {
  it('sets the Show proposal without mutating lines', () => {
    const start = applyAll(fresh(), [added(1, line())]);
    const end = applyAll(start, [
      {
        type: 'session.presentation_changed',
        sessionId: SESSION_ID,
        version: 2,
        actor: 'desk',
        presentation: { lineId: 'r1', catalog: null },
      },
    ]);
    assert.equal(end.presentation.lineId, 'r1');
    assert.equal(end.lines.length, 1);
    assert.equal(end.lines[0].title, start.lines[0].title);
    assert.equal(end.consultStance, start.consultStance);
  });
});

describe('maskPhone', () => {
  it('keeps the last four digits and ignores formatting', () => {
    assert.equal(maskPhone('555-123-4567'), '••• ••• 4567');
    assert.equal(maskPhone('(555) 123 4567'), '••• ••• 4567');
    assert.equal(maskPhone('+1 555 123 4567'), '••• ••• 4567');
  });

  it('returns empty rather than a partial number it cannot mask', () => {
    assert.equal(maskPhone(''), '');
    assert.equal(maskPhone('12'), '');
  });
});
