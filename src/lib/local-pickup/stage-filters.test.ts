import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';
import { parsePickupStageFilters, pickupOrderMatchesStageFilters, type PickupStageFilterLine } from './stage-filters';

function fact(patch: Partial<ReceivingUnitStageFactView> = {}): ReceivingUnitStageFactView {
  return {
    receiving_line_unit_id: 1, receiving_line_id: 2, receiving_id: 3, ordinal: 1,
    serial_unit_id: 4, unit_uid: 'UNIT-1', serial: null, condition_grade: 'USED_A',
    triage_state: 'TRIAGED', label_state: 'PRINTED', qc_state: 'PASSED', latest_verdict: 'PASS',
    tested_at: null, tested_by: null, tested_by_name: null, primary_support_ticket_id: null,
    updated_at: '2026-09-29T10:00:00.000Z', ...patch,
  };
}

function line(patch: Partial<PickupStageFilterLine> = {}): PickupStageFilterLine {
  return {
    order_status: 'COMPLETED', receiving_id: 3, quantity: 1,
    pickup_date: '2026-09-20', customer_name: 'Ken', zoho_vendor_name: null,
    unit_stage_facts: [fact()], ...patch,
  };
}

test('URL parser rejects unknown stage vocabulary and normalizes valid values', () => {
  const parsed = parsePickupStageFilters(new URLSearchParams({
    qc: 'FAILED', triage: 'bogus', label: 'printed', ticket: 'linked',
    vendor: ' Ken ', pickupFrom: '2026-09-01', pickupTo: 'not-a-date',
  }));
  assert.deepEqual(parsed, {
    status: 'all', qc: 'failed', triage: null, label: 'printed', ticket: 'linked',
    vendor: 'Ken', from: '2026-09-01', to: null,
  });
});

test('one order predicate composes QC, label, ticket, seller and pickup date', () => {
  const rows = [line({ unit_stage_facts: [fact({ qc_state: 'FAILED', primary_support_ticket_id: 9600 })] })];
  assert.equal(pickupOrderMatchesStageFilters(rows, {
    status: 'done', qc: 'failed', triage: 'triaged', label: 'printed', ticket: 'linked',
    vendor: 'ken', from: '2026-09-01', to: '2026-09-30',
  }), true);
  assert.equal(pickupOrderMatchesStageFilters(rows, {
    status: 'done', qc: 'passed', triage: 'triaged', label: 'printed', ticket: 'linked',
    vendor: 'ken', from: '2026-09-01', to: '2026-09-30',
  }), false);
});
