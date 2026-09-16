/**
 * The packer-day adapter, held to the same formatting its peers get.
 *
 * Written after the defect it pins (operator 2026-09-16): the family shipped
 * looking hand-rolled — every packer bubble the same default colour, the order
 * number with no channel dot — while being fully on the engine. The cause was a
 * projection two columns short (`staff.id`, `account_source`), and the adapter
 * passed `null` for both without anything complaining.
 *
 * So these tests assert the two things that were wrong and the one rule that
 * would have caught them:
 *   1. the Id chip's two lines are two DIFFERENT facts (order number, tracking);
 *   2. the person face carries a staff id, which is what colours the avatar;
 *   3. adapter PARITY — no shared face is dark without a declared reason.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import { assertCompoundViewParity } from '@/components/tables/compound/compound-row-view-parity';
import { resolveReportPackerDaySlotValue } from '@/lib/tables/field-catalog/report-packer-day-resolve';
import { reportPackerDayCompoundView } from './report-packer-day-row-view';

/**
 * FULLY POPULATED on purpose — every optional fact present. A half-filled
 * fixture would let a dark face pass as "this row has nothing to say", which is
 * the confusion the parity law exists to remove.
 */
function row(overrides: Partial<PackingReportRow> = {}): PackingReportRow {
  return {
    packedAt: '2026-09-15T23:13:00.000Z',
    packerName: 'Thuy',
    packerStaffId: 5,
    sku: '00958-S',
    productTitle: 'Bose Wave Music System III',
    packTier: 'MEDIUM',
    estimatedMinutes: 14,
    trackingType: 'ORDERS',
    trackingOrScanRef: '383615556581',
    orderNumber: '114-2858899-6488236',
    platform: 'Amazon',
    itemNumber: 'B07ZY7DWT6',
    skuCatalogId: 368,
    tierSource: 'rules',
    packerLogId: 91,
    salId: 4242,
    ...overrides,
  };
}

test('the Id chip paints the ORDER NUMBER, never the tracking twice', () => {
  const view = reportPackerDayCompoundView(row());
  assert.equal(view.orderId, '114-2858899-6488236');
  assert.equal(view.tracking, '383615556581');
  assert.equal(view.identityFace?.value, '114-2858899-6488236');
  // The defect: both lines fed from `trackingOrScanRef`.
  assert.notEqual(view.orderId, view.tracking);
});

test('no order number ⇒ the chip’s first line is EMPTY, not the tracking', () => {
  const view = reportPackerDayCompoundView(row({ orderNumber: null }));
  assert.equal(view.orderId, null);
  assert.equal(view.identityFace, null);
  // The tracking still paints its own line — losing it would be the opposite
  // defect.
  assert.equal(view.tracking, '383615556581');
});

test('the channel dot has a fact to resolve from', () => {
  assert.equal(reportPackerDayCompoundView(row()).platformValue, 'Amazon');
});

test('the packer is a PERSON with a staff id — that id is what colours the avatar', () => {
  const value = resolveReportPackerDaySlotValue(row(), 'report-packer-day.packer');
  assert.deepEqual(value, { kind: 'person', staffId: 5, name: 'Thuy' });
});

test('a pack with no resolved packer degrades to a nameless person, not a crash', () => {
  const value = resolveReportPackerDaySlotValue(
    row({ packerName: null, packerStaffId: null }),
    'report-packer-day.packer',
  );
  assert.deepEqual(value, { kind: 'person', staffId: null, name: null });
});

test('adapter parity — no shared face is dark without a declared reason', () => {
  assertCompoundViewParity(reportPackerDayCompoundView(row()), {
    absent: {
      thumbUrl:
        'the packing report projection carries no catalog image; the row is keyed by pack scan, not by listing',
      amount: 'no money on a pack scan — the money lives on the order',
    },
  });
});

test('the basis pill is the trust fact, and only an unpaired pack asks for a human', () => {
  assert.equal(reportPackerDayCompoundView(row({ tierSource: 'profile' })).stateTone, 'done');
  assert.equal(reportPackerDayCompoundView(row({ tierSource: 'rules' })).stateTone, 'neutral');
  assert.equal(reportPackerDayCompoundView(row({ tierSource: 'default' })).stateTone, 'alert');
});
