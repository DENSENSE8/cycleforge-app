import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WALK_IN_JOB,
  WALK_IN_JOBS,
  WALK_IN_JOB_PERMISSIONS,
  isWalkInJob,
  parseWalkInJob,
  walkInStationHref,
} from '@/lib/walk-in/jobs';
import {
  DEFAULT_WALK_IN_HISTORY_CATEGORY,
  WALK_IN_HISTORY_CATEGORIES,
  WALK_IN_HISTORY_ITEMS,
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

// The page gate is `walk_in.view` (route prefix). Repair is a separate tech
// domain, so working the counter must not by itself open the repair queue
// (FOH/BOH split, plan 02·P3).
test('Repair is the only job needing a permission beyond the page gate', () => {
  assert.equal(WALK_IN_JOB_PERMISSIONS.repair, 'repair.view');
  assert.equal(WALK_IN_JOB_PERMISSIONS.sales, null);
  assert.equal(WALK_IN_JOB_PERMISSIONS.pickup, null);
});

test('every job declares its extra-permission stance', () => {
  assert.deepEqual(Object.keys(WALK_IN_JOB_PERMISSIONS).sort(), [...WALK_IN_JOBS].sort());
});

test('parseWalkInHistoryCategory maps legacy tabs and defaults', () => {
  assert.equal(parseWalkInHistoryCategory(null), DEFAULT_WALK_IN_HISTORY_CATEGORY);
  assert.equal(parseWalkInHistoryCategory('done'), 'repairs');
  assert.equal(parseWalkInHistoryCategory('active'), 'repairs');
  assert.equal(parseWalkInHistoryCategory('sales'), 'sales');
  assert.equal(parseWalkInHistoryCategory('pickups'), 'pickups');
});

// Sales is the overall transaction history: an unscoped visit must land on the
// merged feed, never on one category (FOH/BOH split, plan 03·P2).
test('Sales history defaults to every category merged', () => {
  assert.equal(DEFAULT_WALK_IN_HISTORY_CATEGORY, 'all');
  assert.equal(parseWalkInHistoryCategory('all'), 'all');
  assert.equal(parseWalkInHistoryCategory('nope'), 'all');
});

test('every transaction category has a slider item', () => {
  assert.deepEqual(
    WALK_IN_HISTORY_ITEMS.map((item) => item.id),
    [...WALK_IN_HISTORY_CATEGORIES],
  );
});
