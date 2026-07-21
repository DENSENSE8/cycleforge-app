/**
 * Testing bus helpers — narrow workspace patches, not rail dumps.
 * Run: `npx tsx --test src/components/tech/testing-line-events.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { narrowTestingWorkspacePatch } from './testing-line-events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

describe('narrowTestingWorkspacePatch', () => {
  it('keeps serials/workflow/qty and drops age + unrelated hydrate fields', () => {
    const line = {
      id: 42,
      serials: [{ id: 1, serial_number: 'SN-1' }],
      workflow_status: 'IN_TEST',
      qa_status: 'PENDING',
      disposition_code: 'HOLD',
      quantity_received: 1,
      quantity_expected: 2,
      tested_count: 0,
      notes: 'n',
      condition_grade: 'USED_A',
      item_name: 'Widget',
      sku: 'SKU-1',
      catalog_product_title: 'Cat',
      zoho_item_title: 'Zoho',
      last_activity_at: '2026-07-01T00:00:00Z',
      tested_at: '2026-07-20T12:00:00Z',
      unbox_opened_at: '2026-07-19T00:00:00Z',
      receiving_type: 'PO',
      tracking_number: '1Z',
    } as ReceivingLineRow;

    const patch = narrowTestingWorkspacePatch(line);
    assert.equal(patch.id, 42);
    assert.equal(patch.serials?.length, 1);
    assert.equal(patch.workflow_status, 'IN_TEST');
    assert.equal(patch.quantity_received, 1);
    assert.equal(patch.item_name, 'Widget');
    assert.equal('last_activity_at' in patch, false);
    assert.equal('tested_at' in patch, false);
    assert.equal('unbox_opened_at' in patch, false);
    assert.equal('tracking_number' in patch, false);
    assert.equal('receiving_type' in patch, false);
  });
});
