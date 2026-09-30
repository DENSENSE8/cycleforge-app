/**
 * Run: `node --test --import tsx src/lib/receiving/inbound-record-status.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deriveInboundInternalSteps, inboundCurrentStatus } from './inbound-record-status';
import type { ReceivingLineRow } from './receiving-line-row';

function line(partial: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return {
    receiving_id: 10,
    tracking_number: null,
    carrier: null,
    zoho_purchaseorder_number: 'PO-1',
    receiving_source: 'zoho_po',
    quantity_received: 1,
    quantity_expected: 1,
    workflow_status: null,
    needs_test: false,
    created_at: '2026-09-20T10:00:00Z',
    ...partial,
  } as ReceivingLineRow;
}

describe('deriveInboundInternalSteps', () => {
  test('the ladder is Ordered → Docked → Unboxed → Graded → Put away, with no Received step', () => {
    const steps = deriveInboundInternalSteps({ id: 10 }, [line({ id: 1 })], { poDate: '2026-09-18' });
    assert.deepEqual(
      steps.map((step) => step.label),
      ['Ordered', 'Docked', 'Unboxed', 'Graded', 'Put away'],
    );
    assert.equal(steps[0]!.dateOnly, true);
  });

  test('without a PO date the first step is Imported, on the earliest line import time', () => {
    const steps = deriveInboundInternalSteps({ id: 10 }, [
      line({ id: 1, created_at: '2026-09-21T10:00:00Z' }),
      line({ id: 2, created_at: '2026-09-19T10:00:00Z' }),
    ]);
    assert.equal(steps[0]!.label, 'Imported');
    assert.equal(steps[0]!.at, '2026-09-19T10:00:00Z');
    assert.equal(steps[0]!.dateOnly, undefined);
  });

  test('an unfound carton with no lines is Imported on the carton row creation', () => {
    const steps = deriveInboundInternalSteps({ id: 10, created_at: '2026-09-29 14:23:30' }, [line({ id: -10, created_at: null })]);
    assert.equal(steps[0]!.label, 'Imported');
    assert.equal(steps[0]!.at, '2026-09-29 14:23:30');
  });

  test('a receipt with no unbox stamp reads as Unboxed, by whoever received it', () => {
    const steps = deriveInboundInternalSteps({ id: 10, received_at: '2026-09-25 11:52:25', received_by_name: 'David' }, [
      line({ id: 1, received_done_at: '2026-09-25T18:52:25Z' }),
    ]);
    const unboxed = steps.find((step) => step.key === 'unboxed')!;
    assert.equal(unboxed.state, 'done');
    assert.equal(unboxed.who, 'David');
    assert.ok(unboxed.at);
  });
});

describe('inboundCurrentStatus', () => {
  test('Ordered alone is paperwork — the carrier still answers "where is it now"', () => {
    const internal = deriveInboundInternalSteps(null, [line({ id: 1 })], { poDate: '2026-09-18' });
    assert.deepEqual(inboundCurrentStatus({ internal, delivered: false, carrierStatus: 'IN_TRANSIT', tracking: '1Z' }), {
      label: 'In transit',
    });
  });

  test('an unboxed carton awaits grading, never "receive"', () => {
    const internal = deriveInboundInternalSteps(
      { id: 10, tracking_scanned_at: '2026-09-25 10:00:00', unboxed_at: '2026-09-25 11:00:00' },
      [line({ id: 1 })],
    );
    assert.equal(inboundCurrentStatus({ internal, delivered: true, carrierStatus: null, tracking: null }).label, 'Awaiting grading');
  });
});
