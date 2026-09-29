import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolvePickOwnership } from './pick-ownership';

const ANA = 1;
const BEN = 2;
const CY = 3;
const DEE = 4;
const none = new Set<number>();

describe('resolvePickOwnership', () => {
  it('a pass outranks the SKU owner', () => {
    const got = resolvePickOwnership({ assignedStaffId: BEN, pairedStaffId: ANA, backupCandidates: [] }, none);
    assert.deepEqual(got.owner, { staffId: BEN, via: 'assigned' });
  });

  it('the SKU owner gets the pick, with backups auto-selected from history then roster', () => {
    const got = resolvePickOwnership({ assignedStaffId: null, pairedStaffId: ANA, backupCandidates: [ANA, CY, BEN, DEE] }, none);
    assert.deepEqual(got.owner, { staffId: ANA, via: 'sku' });
    // The owner is never their own backup; duplicates collapse; two are kept.
    assert.deepEqual(got.backups, [CY, BEN]);
  });

  it('an owner out today hands the pick to the first backup who is in', () => {
    const got = resolvePickOwnership(
      { assignedStaffId: null, pairedStaffId: ANA, backupCandidates: [CY, BEN] },
      new Set([ANA, CY]),
    );
    assert.deepEqual(got.owner, { staffId: BEN, via: 'backup' });
  });

  it('owner and every backup out → unassigned, anyone may take it', () => {
    const got = resolvePickOwnership({ assignedStaffId: null, pairedStaffId: ANA, backupCandidates: [BEN] }, new Set([ANA, BEN]));
    assert.equal(got.owner, null);
  });

  it('no pass and no SKU owner → unassigned', () => {
    assert.equal(resolvePickOwnership({ assignedStaffId: null, pairedStaffId: null, backupCandidates: [BEN] }, none).owner, null);
  });
});
