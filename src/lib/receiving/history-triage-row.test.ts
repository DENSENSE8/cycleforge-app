import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isHistoryUnfoundRow,
  resolveReceivingColFromTarget,
  historyTriageTargetFromRow,
} from '@/lib/receiving/history-triage-row';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

function row(partial: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return {
    receiving_id: 10,
    tracking_number: null,
    carrier: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    item_name: null,
    quantity_received: 0,
    quantity_expected: null,
    workflow_status: null,
    ...partial,
  } as ReceivingLineRow;
}

describe('isHistoryUnfoundRow', () => {
  test('unmatched source is unfound', () => {
    assert.equal(isHistoryUnfoundRow(row({ id: 1, receiving_source: 'unmatched' })), true);
  });

  test('UNFOUND pairing is unfound', () => {
    assert.equal(isHistoryUnfoundRow(row({ id: 1, pairing_state: 'UNFOUND' })), true);
  });

  test('matched PO is not unfound', () => {
    assert.equal(
      isHistoryUnfoundRow(
        row({
          id: 1,
          receiving_source: 'zoho_po',
          zoho_purchaseorder_number: '49-94699',
          pairing_state: 'MATCHED',
        }),
      ),
      false,
    );
  });
});

describe('historyTriageTargetFromRow', () => {
  test('requires receiving_id', () => {
    assert.equal(historyTriageTargetFromRow(row({ id: 1, receiving_id: null })), null);
  });

  test('maps identity seed', () => {
    const t = historyTriageTargetFromRow(
      row({
        id: 42,
        receiving_id: 7,
        zoho_purchaseorder_number: 'PO-1',
        tracking_number: '1Z',
        zoho_item_title: 'Speaker',
        workflow_status: 'RECEIVED',
      }),
    );
    assert.deepEqual(t, {
      receivingId: 7,
      receivingLineId: 42,
      poNumber: 'PO-1',
      title: 'Speaker',
      tracking: '1Z',
      status: 'RECEIVED',
    });
  });
});

describe('resolveReceivingColFromTarget', () => {
  test('reads data-col from closest ancestor', () => {
    const outer = { closest: (sel: string) => (sel === '[data-col]' ? { getAttribute: () => 'tracking' } : null) };
    assert.equal(resolveReceivingColFromTarget(outer as unknown as EventTarget), 'tracking');
  });

  test('ignores select gutter', () => {
    const outer = { closest: () => ({ getAttribute: () => 'select' }) };
    assert.equal(resolveReceivingColFromTarget(outer as unknown as EventTarget), null);
  });
});
