/**
 * QC Recent rail age axis — last Testing open only.
 * Run: `npx tsx --test src/lib/receiving/rail/feeds.testing-opened.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTestingOpenedAt } from './status';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

function row(partial: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return {
    receiving_id: partial.receiving_id ?? partial.id,
    tracking_number: null,
    carrier: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    item_name: null,
    sku: null,
    quantity_received: 0,
    quantity_expected: null,
    qa_status: 'PENDING',
    workflow_status: null,
    disposition_code: 'HOLD',
    condition_grade: '',
    disposition_audit: [],
    needs_test: true,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: null,
    created_at: null,
    image_url: null,
    source_platform: null,
    receiving_source: null,
    ...partial,
  };
}

describe('getTestingOpenedAt', () => {
  it('uses testing_opened_at only — ignores tested_at / created_at / unbox time', () => {
    const opened = '2026-08-26T18:00:00Z';
    const old = '2026-08-01T00:00:00Z';
    assert.equal(
      getTestingOpenedAt(
        row({
          id: 1,
          testing_opened_at: opened,
          tested_at: old,
          created_at: old,
          unbox_opened_at: old,
          last_activity_at: old,
        }),
      ),
      opened,
    );
  });

  it('returns null when testing_opened_at is missing even if tested_at is set', () => {
    assert.equal(
      getTestingOpenedAt(
        row({ id: 2, testing_opened_at: null, tested_at: '2026-08-26T20:00:00Z' }),
      ),
      null,
    );
  });
});
