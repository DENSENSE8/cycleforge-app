/**
 * Run: node --import tsx --test src/components/tables/compound/staff-stage-lane.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyStaffLaneRole,
  oppositeStaffLane,
  staffLaneEmptyLabel,
  staffLaneFaceLabel,
  staffLaneRosterFaces,
  staffMatchesStageLane,
} from './staff-stage-lane';

describe('staffMatchesStageLane', () => {
  it('keeps the all-staff roster unfiltered', () => {
    assert.equal(staffMatchesStageLane({ role: 'sales', roles: [] }, 'all'), true);
  });

  it('maps picker aliases onto the Pick lane', () => {
    assert.equal(staffMatchesStageLane({ role: 'technician', roles: [] }, 'technician'), true);
    assert.equal(staffMatchesStageLane({ role: '', roles: ['picker'] }, 'technician'), true);
    assert.equal(staffMatchesStageLane({ role: 'packer', roles: [] }, 'technician'), false);
  });

  it('maps pack aliases onto the Packed lane', () => {
    assert.equal(staffMatchesStageLane({ role: 'packer', roles: [] }, 'packer'), true);
    assert.equal(staffMatchesStageLane({ role: '', roles: ['pack'] }, 'packer'), true);
    assert.equal(staffMatchesStageLane({ role: 'technician', roles: [] }, 'packer'), false);
  });
});

describe('oppositeStaffLane', () => {
  it('swaps picker and packer', () => {
    assert.equal(oppositeStaffLane('packer'), 'technician');
    assert.equal(oppositeStaffLane('technician'), 'packer');
  });
});

describe('applyStaffLaneRole', () => {
  it('moves a packer onto the Pick lane without dropping unrelated roles', () => {
    const next = applyStaffLaneRole(
      { role: 'packer', roles: ['packer', 'admin.manage_staff'] },
      'technician',
    );
    assert.equal(next.role, 'technician');
    assert.deepEqual(next.roles, ['technician', 'admin.manage_staff']);
    assert.equal(staffMatchesStageLane(next, 'technician'), true);
    assert.equal(staffMatchesStageLane(next, 'packer'), false);
  });
});

describe('staffLaneRosterFaces', () => {
  it('gives Pick the Picker switch and Packed the Packer switch', () => {
    assert.deepEqual(staffLaneRosterFaces('technician'), ['technician']);
    assert.deepEqual(staffLaneRosterFaces('packer'), ['packer']);
    assert.equal(staffLaneFaceLabel('technician'), 'Picker');
    assert.equal(staffLaneFaceLabel('packer'), 'Packer');
  });

  it('gives the all-staff roster both floor faces', () => {
    assert.deepEqual(staffLaneRosterFaces('all'), ['technician', 'packer']);
  });
});

describe('staffLaneEmptyLabel', () => {
  it('names the empty roster by lane', () => {
    assert.equal(staffLaneEmptyLabel('all'), 'No staff');
    assert.equal(staffLaneEmptyLabel('packer'), 'No packers');
    assert.equal(staffLaneEmptyLabel('technician'), 'No pickers');
  });
});
