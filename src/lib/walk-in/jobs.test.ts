import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WALK_IN_JOB,
  isWalkInJob,
  parseWalkInJob,
  walkInStationHref,
} from '@/lib/walk-in/jobs';
import {
  DEFAULT_WALK_IN_HISTORY_CATEGORY,
  parseWalkInHistoryCategory,
} from '@/lib/walk-in/history-categories';

test('parseWalkInJob defaults to pickup', () => {
  assert.equal(parseWalkInJob(null), DEFAULT_WALK_IN_JOB);
  assert.equal(parseWalkInJob(''), DEFAULT_WALK_IN_JOB);
  assert.equal(parseWalkInJob('nope'), DEFAULT_WALK_IN_JOB);
});

test('parseWalkInJob accepts sales|pickup|repair', () => {
  assert.equal(parseWalkInJob('sales'), 'sales');
  assert.equal(parseWalkInJob('pickup'), 'pickup');
  assert.equal(parseWalkInJob('repair'), 'repair');
  assert.equal(isWalkInJob('sales'), true);
  assert.equal(isWalkInJob('active'), false);
});

test('walkInStationHref omits default job and clears extras as passed', () => {
  assert.equal(walkInStationHref('pickup'), '/pickup');
  assert.equal(walkInStationHref('sales'), '/pickup?job=sales');
  assert.equal(
    walkInStationHref('repair', { new: 'true', openRepair: '42' }),
    '/pickup?job=repair&new=true&openRepair=42',
  );
});

test('parseWalkInHistoryCategory maps legacy tabs and defaults', () => {
  assert.equal(parseWalkInHistoryCategory(null), DEFAULT_WALK_IN_HISTORY_CATEGORY);
  assert.equal(parseWalkInHistoryCategory('done'), 'repairs');
  assert.equal(parseWalkInHistoryCategory('active'), 'repairs');
  assert.equal(parseWalkInHistoryCategory('sales'), 'sales');
  assert.equal(parseWalkInHistoryCategory('pickups'), 'pickups');
});
