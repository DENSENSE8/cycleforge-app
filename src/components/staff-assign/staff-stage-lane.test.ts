import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { staffLaneEmptyLabel, staffMatchesStageLane, withStaffLane } from './staff-stage-lane';

describe('staffMatchesStageLane', () => {
  it('keeps the all-staff roster unfiltered', () => {
    assert.equal(staffMatchesStageLane({ functionalRoles: [] }, 'all'), true);
  });

  it('reads functional roles, never RBAC access keys', () => {
    const rbacOnly = { role: 'technician', roles: ['technician', 'packer'], functionalRoles: [] };
    assert.equal(staffMatchesStageLane(rbacOnly, 'technician'), false);
    assert.equal(staffMatchesStageLane(rbacOnly, 'packer'), false);
    assert.equal(staffMatchesStageLane({ functionalRoles: ['picker'] }, 'technician'), true);
    assert.equal(staffMatchesStageLane({ functionalRoles: ['packer'] }, 'packer'), true);
  });

  it('lets one person be both picker and packer', () => {
    const both = { functionalRoles: ['packer', 'picker'] as const };
    assert.equal(staffMatchesStageLane(both, 'technician'), true);
    assert.equal(staffMatchesStageLane(both, 'packer'), true);
  });
});

describe('withStaffLane', () => {
  it('granting packer keeps picker (non-exclusive)', () => {
    const next = withStaffLane({ id: 1, functionalRoles: ['picker'] as ('picker' | 'packer')[] }, 'packer', true);
    assert.deepEqual(next.functionalRoles, ['packer', 'picker']);
  });

  it('revoking picker leaves packer and is idempotent', () => {
    const start = { functionalRoles: ['packer', 'picker'] as ('picker' | 'packer')[] };
    const once = withStaffLane(start, 'technician', false);
    assert.deepEqual(once.functionalRoles, ['packer']);
    assert.deepEqual(withStaffLane(once, 'technician', false).functionalRoles, ['packer']);
  });
});

describe('staffLaneEmptyLabel', () => {
  it('names the empty roster by lane', () => {
    assert.equal(staffLaneEmptyLabel('all'), 'No staff');
    assert.equal(staffLaneEmptyLabel('packer'), 'No packers');
    assert.equal(staffLaneEmptyLabel('technician'), 'No pickers');
  });
});
