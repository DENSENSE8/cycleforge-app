/**
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     --test src/lib/kiosk/kiosk-session-store.test.ts
 *
 * P4b of `docs/todo/kiosk-desk-session-channel-PLAN.md` — the shared transport.
 *
 * The store is a module singleton, so every test resets it first. That is not
 * boilerplate: a leaked mirror between tests would be the same bug the detach
 * path exists to prevent (one customer's basket surviving into the next visit).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { kioskSessionStore, type KioskSharedWriter } from './kiosk-session-store';
import type { KioskCartLine } from './cart-line';

function line(overrides: Partial<KioskCartLine> = {}): KioskCartLine {
  return {
    id: 'srv-1',
    type: 'RETAIL',
    title: 'Case',
    quantity: 1,
    unitAmountCents: 1999,
    payload: { variationId: null, sku: 'CASE-1' },
    ...overrides,
  };
}

function mirrorOnce(version: number, lines: KioskCartLine[], masked = '••• ••• 4567') {
  kioskSessionStore.mirrorSharedSession({
    sessionId: 42,
    version,
    lines,
    customerName: 'Dana',
    customerPhoneMasked: masked,
    awaitingSignatureLineIds: [],
  });
}

beforeEach(() => {
  kioskSessionStore.resetSession();
  kioskSessionStore.attachSharedWriter(null);
});

describe('local transport — unchanged by the shared one', () => {
  it('still owns its own cart when no desk holds the tablet', () => {
    kioskSessionStore.addRetail({
      title: 'Cable',
      unitAmountCents: 999,
      payload: { variationId: null, sku: 'CBL' },
    });
    const snap = kioskSessionStore.getSnapshot();
    assert.equal(snap.lines.length, 1);
    assert.equal(snap.sharedSessionId, null, 'local is still the default');
  });

  it('a fresh session declares no shared state', () => {
    const snap = kioskSessionStore.getSnapshot();
    assert.equal(snap.sharedSessionId, null);
    assert.equal(snap.sharedVersion, 0);
    assert.equal(snap.sharedCustomerPhoneMasked, '');
    assert.deepEqual(snap.sharedAwaitingSignatureLineIds, []);
  });
});

describe('shared transport — the tablet mirrors the desk', () => {
  it('writes the server projection into the cart every pane already reads', () => {
    mirrorOnce(3, [line(), line({ id: 'srv-2', title: 'Screen protector', quantity: 2 })]);
    const snap = kioskSessionStore.getSnapshot();

    assert.equal(snap.sharedSessionId, 42);
    assert.equal(snap.sharedVersion, 3);
    assert.deepEqual(snap.lines.map((l) => l.id), ['srv-1', 'srv-2']);
    assert.equal(snap.customerName, 'Dana');
  });

  it('keeps the masked phone OUT of the identity field', () => {
    mirrorOnce(1, [line()]);
    const snap = kioskSessionStore.getSnapshot();

    assert.equal(snap.sharedCustomerPhoneMasked, '••• ••• 4567');
    assert.equal(
      snap.customerPhone,
      '',
      'a masked string in customerPhone would be submitted as a real number',
    );
  });

  it('drops a stale projection instead of rolling the screen backwards', () => {
    mirrorOnce(5, [line(), line({ id: 'srv-2' })]);
    // A poll answering after a newer event already landed.
    mirrorOnce(4, [line()]);

    const snap = kioskSessionStore.getSnapshot();
    assert.equal(snap.sharedVersion, 5);
    assert.equal(snap.lines.length, 2);
  });

  it('accepts the same version again (a re-read is not a regression)', () => {
    mirrorOnce(5, [line()]);
    mirrorOnce(5, [line(), line({ id: 'srv-2' })]);
    assert.equal(kioskSessionStore.getSnapshot().lines.length, 2);
  });
});

describe('write-through — staff and customer fill the same form at once', () => {
  interface Recorder {
    added: KioskCartLine[];
    updated: Array<{ id: string; patch: Record<string, unknown> }>;
    removed: string[];
  }

  function recorder(): Recorder {
    const rec: Recorder = { added: [], updated: [], removed: [] };
    const writer: KioskSharedWriter = {
      addLine: (l) => void rec.added.push(l),
      updateLine: (id, patch) => void rec.updated.push({ id, patch: patch as Record<string, unknown> }),
      removeLine: (id) => void rec.removed.push(id),
    };
    kioskSessionStore.attachSharedWriter(writer);
    return rec;
  }

  it('applies a local add optimistically AND sends it', () => {
    mirrorOnce(1, [line()]);
    const rec = recorder();

    kioskSessionStore.addRetail({
      title: 'Customer added this',
      unitAmountCents: 0,
      payload: { variationId: null, sku: 'X' },
    });

    assert.deepEqual(
      kioskSessionStore.getSnapshot().lines.map((l) => l.title),
      ['Case', 'Customer added this'],
      'the customer sees their own line immediately',
    );
    assert.equal(rec.added.length, 1, 'and the desk learns about it');
    assert.equal(rec.added[0].title, 'Customer added this');
  });

  it('sends a correction — the customer knows their own serial better than the operator', () => {
    mirrorOnce(1, [line()]);
    const rec = recorder();

    kioskSessionStore.updateLine('srv-1', { quantity: 3 });

    assert.deepEqual(rec.updated, [{ id: 'srv-1', patch: { quantity: 3 } }]);
    assert.equal(kioskSessionStore.getSnapshot().lines[0].quantity, 3);
  });

  it('routes a remove to the writer rather than silently dropping it', () => {
    // A remove on a shared session is a VOID — staff work. The writer decides
    // not to send it, and the next mirror puts the line back. What must NOT
    // happen is the store swallowing it with no trace, which is how the tablet's
    // own line editor came to call a method that did nothing at all.
    mirrorOnce(1, [line()]);
    const rec = recorder();

    kioskSessionStore.removeLine('srv-1');
    assert.deepEqual(rec.removed, ['srv-1']);
  });

  it('stays purely local when no writer is attached', () => {
    kioskSessionStore.attachSharedWriter(null);
    mirrorOnce(1, [line()]);

    kioskSessionStore.updateLine('srv-1', { quantity: 9 });
    assert.equal(kioskSessionStore.getSnapshot().lines[0].quantity, 9, 'no server to defer to');
  });

  it('detach clears the writer — a stale one could post into someone else’s visit', () => {
    mirrorOnce(1, [line()]);
    const rec = recorder();
    kioskSessionStore.detachSharedSession();

    kioskSessionStore.addRetail({
      title: 'After detach',
      unitAmountCents: 100,
      payload: { variationId: null, sku: 'Y' },
    });
    assert.equal(rec.added.length, 0);
  });
});

describe('detach — the next customer must not see the last one’s basket', () => {
  it('clears the mirrored cart and identity', () => {
    mirrorOnce(7, [line(), line({ id: 'srv-2' })]);
    kioskSessionStore.detachSharedSession();

    const snap = kioskSessionStore.getSnapshot();
    assert.equal(snap.sharedSessionId, null);
    assert.equal(snap.sharedVersion, 0);
    assert.equal(snap.sharedCustomerPhoneMasked, '');
    assert.equal(snap.customerName, '');
    assert.deepEqual(snap.lines, []);
  });

  it('keeps the pane the operator is looking at, and the face', () => {
    kioskSessionStore.setActiveCommand('repair');
    kioskSessionStore.setFace('customer', { manual: true });
    mirrorOnce(1, [line()]);
    kioskSessionStore.detachSharedSession();

    const snap = kioskSessionStore.getSnapshot();
    assert.equal(snap.activeCommand, 'repair', 'detaching is not a pane change');
    assert.equal(snap.face, 'customer');
    assert.equal(snap.faceManualOverride, true);
  });

  it('is a no-op when nothing was attached', () => {
    kioskSessionStore.addRetail({
      title: 'Local',
      unitAmountCents: 100,
      payload: { variationId: null, sku: 'X' },
    });
    kioskSessionStore.detachSharedSession();
    assert.equal(kioskSessionStore.getSnapshot().lines.length, 1, 'a local cart is not swept away');
  });
});

describe('consult stance', () => {
  it('keeps lines, phone, and command across Work → Show → Verify → Work', () => {
    kioskSessionStore.addRetail({
      title: 'Case',
      unitAmountCents: 1999,
      payload: { variationId: null, sku: 'CASE-1' },
    });
    kioskSessionStore.setCustomer({ phone: '5551234567', name: 'Dana' });
    kioskSessionStore.setActiveCommand('repair');

    kioskSessionStore.setConsultStance('show', { manual: true });
    kioskSessionStore.setConsultStance('verify', { manual: true });
    kioskSessionStore.setConsultStance('work', { manual: true });

    const snap = kioskSessionStore.getSnapshot();
    assert.equal(snap.consultStance, 'work');
    assert.equal(snap.face, 'staff');
    assert.equal(snap.lines.length, 1);
    assert.equal(snap.lines[0].title, 'Case');
    assert.equal(snap.customerPhone, '5551234567');
    assert.equal(snap.activeCommand, 'repair');
  });

  it('does not reset stance or clear lines on a command switch', () => {
    kioskSessionStore.addRetail({
      title: 'Case',
      unitAmountCents: 1999,
      payload: { variationId: null, sku: 'CASE-1' },
    });
    kioskSessionStore.setConsultStance('show', { manual: true });
    kioskSessionStore.setActiveCommand('repair');
    kioskSessionStore.setActiveCommand('retail');

    const snap = kioskSessionStore.getSnapshot();
    assert.equal(snap.consultStance, 'show');
    assert.equal(snap.face, 'customer');
    assert.equal(snap.lines.length, 1);
    assert.equal(snap.activeCommand, 'retail');
  });

  it('setPresentation does not mutate lines', () => {
    kioskSessionStore.addRetail({
      title: 'Case',
      unitAmountCents: 1999,
      payload: { variationId: null, sku: 'CASE-1' },
    });
    const before = kioskSessionStore.getSnapshot().lines[0];
    kioskSessionStore.setPresentation({ lineId: before.id, catalog: null });
    const snap = kioskSessionStore.getSnapshot();
    assert.equal(snap.presentation.lineId, before.id);
    assert.equal(snap.lines[0].title, before.title);
    assert.equal(snap.lines[0].unitAmountCents, before.unitAmountCents);
  });
});

/**
 * Operator 2026-09-15: *"Whenever I go to the kiosk page, it defaults to sales.
 * It must default to repair service."* The store seeded `'retail'` while
 * `/kiosk/v2` was already seeding the REPAIR catalog rail, so the tablet
 * painted a repair first frame and then booted into Sales.
 *
 * The org's choice arrives with the HTML (`counter-boot.server.ts`), which
 * means it can land at any point during boot — so what these defend is that it
 * only ever lands on a PRISTINE counter.
 */
describe('the org’s opening command', () => {
  /*
   * The remembered org choice SURVIVES `resetSession` by design (a visit ending
   * must not forget where the counter opens), so the file's shared reset cannot
   * clear it — these tests pin it back to the fallback themselves. Record
   * first, then reset: `resetSession` is what re-seeds `activeCommand` from it.
   */
  beforeEach(() => {
    kioskSessionStore.applyDefaultCommand('repair');
    kioskSessionStore.resetSession();
  });

  it('opens on repair out of the box, not on sales', () => {
    assert.equal(kioskSessionStore.getSnapshot().activeCommand, 'repair');
  });

  it('adopts the org’s choice on a pristine counter', () => {
    kioskSessionStore.applyDefaultCommand('pickup');
    assert.equal(kioskSessionStore.getSnapshot().activeCommand, 'pickup');
  });

  it('never overrides a staffer who has already picked', () => {
    kioskSessionStore.setActiveCommand('buyback');
    kioskSessionStore.applyDefaultCommand('retail');
    assert.equal(kioskSessionStore.getSnapshot().activeCommand, 'buyback');
  });

  it('never yanks a counter that already has lines', () => {
    kioskSessionStore.addRetail({
      title: 'Cable',
      unitAmountCents: 999,
      payload: { variationId: null, sku: 'CBL-1' },
    });
    kioskSessionStore.applyDefaultCommand('pickup');
    assert.equal(kioskSessionStore.getSnapshot().activeCommand, 'repair');
  });

  it('never overrides a desk-held mirror — that command is the server’s', () => {
    mirrorOnce(1, [line()]);
    assert.notEqual(kioskSessionStore.getSnapshot().sharedSessionId, null, 'mirror not attached');
    kioskSessionStore.applyDefaultCommand('pickup');
    assert.equal(kioskSessionStore.getSnapshot().activeCommand, 'repair');
  });

  it('returns to the org’s choice on Next Customer, not to the fallback', () => {
    kioskSessionStore.applyDefaultCommand('retail');
    kioskSessionStore.setActiveCommand('buyback');
    kioskSessionStore.resetSession();
    // Both the pick AND the fallback lose to the org's setting here: a fresh
    // visit is a fresh counter, and the counter opens where the org says.
    assert.equal(kioskSessionStore.getSnapshot().activeCommand, 'retail');
  });

  it('remembers a choice it could not apply at the time', () => {
    kioskSessionStore.addRetail({
      title: 'Cable',
      unitAmountCents: 999,
      payload: { variationId: null, sku: 'CBL-1' },
    });
    kioskSessionStore.applyDefaultCommand('pickup');
    assert.equal(kioskSessionStore.getSnapshot().activeCommand, 'repair', 'must not yank');
    kioskSessionStore.resetSession();
    assert.equal(kioskSessionStore.getSnapshot().activeCommand, 'pickup');
  });
});

