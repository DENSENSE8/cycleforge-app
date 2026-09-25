import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AutomationAssignAction, ListingAssignBody } from '@/lib/schemas/automations';

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

  it('accepts backups that differ from the primaries', () => {
    const parsed = ListingAssignBody.parse({
      orderIds: [1],
      mode: 'save_and_assign',
      techId: 7,
      backupTechId: 8,
      packerId: 12,
      backupPackerId: null,
    });
    assert.equal(parsed.backupTechId, 8);
  });

  it('rejects a backup equal to its primary', () => {
    const base = { orderIds: [1], mode: 'save_and_assign', techId: 7, packerId: 12 } as const;
    assert.throws(() => ListingAssignBody.parse({ ...base, backupTechId: 7 }));
    assert.throws(() => ListingAssignBody.parse({ ...base, backupPackerId: 12 }));
  });
});

describe('AutomationAssignAction', () => {
  it('accepts an optional distinct backup_staff_id', () => {
    const base = { type: 'assign_work', work_type: 'PACK', staff_id: 12 } as const;
    assert.deepEqual(AutomationAssignAction.parse(base), base);
    assert.equal(AutomationAssignAction.parse({ ...base, backup_staff_id: 13 }).backup_staff_id, 13);
    assert.throws(() => AutomationAssignAction.parse({ ...base, backup_staff_id: 12 }));
  });
});
