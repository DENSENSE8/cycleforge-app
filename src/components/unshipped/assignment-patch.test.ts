import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignmentPatchFromEvent } from '@/components/unshipped/UnshippedTable';

/**
 * The event payload → row-patch boundary. `useOrderAssignment` dispatches
 * `order-assignment-updated` on every mutation and `UnshippedTable`'s listener
 * turns it into a cache patch; a field missing from THIS map is a verb the API
 * accepts, the toast confirms… and the queue never shows.
 *
 * That is exactly how clearing urgent shipped broken (operator 2026-09-15):
 * the mutation 200'd, "Urgent cleared" toasted, and the row stayed yellow with
 * the strip's transition label stuck on "Clear urgent" — `isUrgent` was in
 * neither the guard nor the patch.
 */
describe('assignmentPatchFromEvent', () => {
  it('maps the urgent toggle onto the row', () => {
    assert.deepEqual(assignmentPatchFromEvent({ orderIds: [1], isUrgent: false }), {
      is_urgent: false,
    });
    assert.deepEqual(assignmentPatchFromEvent({ orderIds: [1], isUrgent: true }), {
      is_urgent: true,
    });
  });

  it('still maps every field the other verbs dispatch', () => {
    // A regression here is silent: the verb succeeds server-side and the queue
    // never hears about it. Every key the strip / details panel can write.
    const patch = assignmentPatchFromEvent({
      orderIds: [1],
      testerId: 7,
      testerName: 'Ada',
      packerId: 8,
      packerName: 'Bo',
      deadlineAt: '2026-09-20',
      isOutOfStock: true,
      notes: 'repack',
      itemNumber: 'ABC-1',
      condition: 'New',
      shippingTrackingNumber: '1Z9',
    });
    assert.deepEqual(patch, {
      tester_id: 7,
      tester_name: 'Ada',
      tested_by_name: 'Ada',
      packer_id: 8,
      packer_name: 'Bo',
      packed_by_name: 'Bo',
      deadline_at: '2026-09-20',
      is_out_of_stock: true,
      notes: 'repack',
      item_number: 'ABC-1',
      condition: 'New',
      shipping_tracking_number: '1Z9',
    });
    assert.ok(!('is_urgent' in patch), 'absent isUrgent must not invent a patch key');
  });
});
