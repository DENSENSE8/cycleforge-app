import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ListingAssignBody } from '@/lib/schemas/automations';

describe('ListingAssignBody', () => {
  it('requires staff for save_and_assign', () => {
    assert.throws(() =>
      ListingAssignBody.parse({
        orderIds: [1],
        mode: 'save_and_assign',
      }),
    );
  });

  it('accepts save_and_assign with tech + packer', () => {
    const parsed = ListingAssignBody.parse({
      orderIds: [1, 2],
      mode: 'save_and_assign',
      techId: 7,
      packerId: 12,
    });
    assert.equal(parsed.mode, 'save_and_assign');
  });

  it('accepts apply_existing without staff', () => {
    const parsed = ListingAssignBody.parse({
      orderIds: [3],
      mode: 'apply_existing',
    });
    assert.equal(parsed.mode, 'apply_existing');
  });
});
