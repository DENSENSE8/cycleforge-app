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
import { kioskSessionStore } from './kiosk-session-store';
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

describe('D5 — while a desk holds the tablet, the desk owns the lines', () => {
  it('refuses a local add', () => {
    mirrorOnce(1, [line()]);
    kioskSessionStore.addRetail({
      title: 'Sneaky',
      unitAmountCents: 100,
      payload: { variationId: null, sku: 'X' },
    });
    assert.deepEqual(
      kioskSessionStore.getSnapshot().lines.map((l) => l.title),
      ['Case'],
      'a local edit the server never took would be erased by the next mirror anyway',
    );
  });

  it('refuses a local quantity or price edit', () => {
    mirrorOnce(1, [line()]);
    kioskSessionStore.updateLine('srv-1', { quantity: 99, unitAmountCents: 1 });

    const l = kioskSessionStore.getSnapshot().lines[0];
    assert.equal(l.quantity, 1);
    assert.equal(l.unitAmountCents, 1999);
  });

  it('refuses a local remove', () => {
    mirrorOnce(1, [line()]);
    kioskSessionStore.removeLine('srv-1');
    assert.equal(kioskSessionStore.getSnapshot().lines.length, 1);
  });

  it('lets those same edits through once the desk lets go', () => {
    mirrorOnce(1, [line()]);
    kioskSessionStore.detachSharedSession();

    kioskSessionStore.addRetail({
      title: 'Local again',
      unitAmountCents: 500,
      payload: { variationId: null, sku: 'Y' },
    });
    assert.deepEqual(kioskSessionStore.getSnapshot().lines.map((l) => l.title), ['Local again']);
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
