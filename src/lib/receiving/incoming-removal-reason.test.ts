/**
 * The removal-reason ladder — one derivation for the "recently removed" lane
 * and the bulk-paste residual report.
 *
 * Run: `npx tsx --test src/lib/receiving/incoming-removal-reason.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INCOMING_REMOVAL_REASONS,
  INCOMING_REMOVAL_REASON_FACE,
  resolveIncomingRemovalReason,
  type IncomingRemovalSignals,
} from './incoming-removal-reason';
import { resolveWatchState } from './watch-state';

const NONE: IncomingRemovalSignals = {
  delivered: false,
  scanned: false,
  unboxed: false,
  writtenOff: false,
  vendorReceived: false,
  vendorCancelled: false,
  agedOut: false,
};

const signals = (over: Partial<IncomingRemovalSignals>): IncomingRemovalSignals => ({
  ...NONE,
  ...over,
});

test('a row that has not left gets no reason — the lane never invents a removal', () => {
  assert.equal(resolveIncomingRemovalReason(NONE), null);
  // Delivered and still on the hunt queue is not a removal either.
  assert.equal(resolveIncomingRemovalReason(signals({ delivered: true })), null);
});

test('each exit resolves on its own', () => {
  assert.equal(resolveIncomingRemovalReason(signals({ delivered: true, unboxed: true })), 'unboxed');
  assert.equal(resolveIncomingRemovalReason(signals({ writtenOff: true })), 'written_off');
  assert.equal(resolveIncomingRemovalReason(signals({ delivered: true, scanned: true })), 'dock_scanned');
  assert.equal(resolveIncomingRemovalReason(signals({ vendorReceived: true })), 'vendor_received');
  assert.equal(resolveIncomingRemovalReason(signals({ vendorCancelled: true })), 'vendor_cancelled');
  assert.equal(resolveIncomingRemovalReason(signals({ delivered: true, agedOut: true })), 'aged_out');
});

test('PHYSICAL FIRST — the floor outranks the vendor when both are true', () => {
  // The house stance: `delivered-unscanned.ts` forbids ERP status from hiding an
  // unscanned box, and the same order applies to naming why a row left.
  assert.equal(
    resolveIncomingRemovalReason(
      signals({ delivered: true, unboxed: true, scanned: true, vendorReceived: true }),
    ),
    'unboxed',
  );
  assert.equal(
    resolveIncomingRemovalReason(signals({ delivered: true, scanned: true, vendorReceived: true })),
    'dock_scanned',
  );
  assert.equal(
    resolveIncomingRemovalReason(signals({ writtenOff: true, vendorReceived: true, scanned: true })),
    'written_off',
  );
});

test('a cancelled PO is NOT reported as received', () => {
  // Both statuses drop the row; conflating them would tell an operator a
  // cancelled order arrived. Six exits rather than five, for this reason.
  const cancelled = resolveIncomingRemovalReason(signals({ vendorCancelled: true }));
  assert.equal(cancelled, 'vendor_cancelled');
  assert.notEqual(INCOMING_REMOVAL_REASON_FACE[cancelled!].label, INCOMING_REMOVAL_REASON_FACE.vendor_received.label);
});

test('a dock scan counts even when the carrier has not reported delivery', () => {
  // `resolveWatchState` calls this `in_flight` because it answers a
  // carrier-shaped question; physically the box is here and off the lane.
  assert.equal(
    resolveWatchState({ known: true, delivered: false, scanned: true, unboxed: false }),
    'in_flight',
  );
  assert.equal(resolveIncomingRemovalReason(signals({ scanned: true })), 'dock_scanned');
});

test('the unboxed rung COMPOSES the watch state rather than re-testing the flag', () => {
  // If `resolveWatchState` ever changes what "done" means, this ladder follows.
  for (const delivered of [true, false]) {
    const s = signals({ delivered, unboxed: true });
    const watch = resolveWatchState({ known: true, delivered, scanned: false, unboxed: true });
    assert.equal(watch, 'done');
    assert.equal(resolveIncomingRemovalReason(s), 'unboxed');
  }
});

test('every reason has a face — a lane row can always say why', () => {
  for (const reason of INCOMING_REMOVAL_REASONS) {
    const face = INCOMING_REMOVAL_REASON_FACE[reason];
    assert.ok(face.label.length > 0, `${reason} needs a label`);
    assert.ok(face.tip.length > 0, `${reason} needs a tip`);
    // The blurb is what the residual list renders VISIBLY, so a missing one
    // silently drops back to a chip nobody can read without hovering.
    assert.ok(face.blurb.length > 0, `${reason} needs a blurb`);
    assert.ok(face.className.includes('ring-'), `${reason} needs house chip classes`);
  }
});

test('no face says "upstream" — a label names the object, not a direction', () => {
  // Reworded 2026-08-03 after an operator asked what the difference between
  // "Received upstream" and "Cancelled upstream" was. "Upstream" is our word
  // for the purchasing source and means nothing on the floor; the PO is the
  // thing whose status actually flipped, and it is a noun operators hold.
  for (const reason of INCOMING_REMOVAL_REASONS) {
    const face = INCOMING_REMOVAL_REASON_FACE[reason];
    assert.doesNotMatch(
      face.label,
      /upstream/i,
      `${reason}: say what changed (the PO), not which direction it changed in`,
    );
  }
});

test('the vendor faces disclose that the timestamp is a POLL, not a transition', () => {
  // `zoho_po_mirror` records when WE synced. Until `status_changed_at` exists,
  // the copy must not imply the vendor changed it just now.
  for (const reason of ['vendor_received', 'vendor_cancelled'] as const) {
    assert.match(
      INCOMING_REMOVAL_REASON_FACE[reason].tip,
      /last synced/i,
      `${reason} must not claim a transition time it does not have`,
    );
  }
});
