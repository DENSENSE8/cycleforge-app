/**
 * Unboxed rail sort axis — ops_events UNBOX_SCAN_OPENED MRU only.
 * Run: `npx tsx --test src/lib/receiving/rail/feeds.unbox-opened.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unboxOpenedRecencyMs } from './feeds';
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

describe('unboxOpenedRecencyMs', () => {
  it('uses unbox_opened_at only — ignores triage scanned_at / door times', () => {
    const oldDoor = '2026-01-01T00:00:00Z';
    const recentUnbox = '2026-07-20T18:00:00Z';
    const a = row({
      id: 1,
      unbox_opened_at: recentUnbox,
      scanned_at: oldDoor,
      received_at: oldDoor,
      created_at: oldDoor,
    });
    const b = row({
      id: 2,
      unbox_opened_at: '2026-07-19T12:00:00Z',
      scanned_at: '2026-07-20T20:00:00Z', // newer door scan must not win
    });
    assert.ok(unboxOpenedRecencyMs(a) > unboxOpenedRecencyMs(b));
  });

  it('returns 0 when unbox_opened_at is missing even if scanned_at is set', () => {
    assert.equal(
      unboxOpenedRecencyMs(
        row({ id: 3, unbox_opened_at: null, scanned_at: '2026-07-20T20:00:00Z' }),
      ),
      0,
    );
  });
});
