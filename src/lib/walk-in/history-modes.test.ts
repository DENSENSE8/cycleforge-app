import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PICKUP_TAB,
  DEFAULT_REPAIR_TAB,
  DEFAULT_SALES_TAB,
  DEFAULT_WALK_IN_HISTORY_MODE,
  PICKUP_TAB_STATUS,
  WALK_IN_HISTORY_MODES,
  WALK_IN_HISTORY_MODE_ITEMS,
  WALK_IN_MODE_PERMISSION,
  defaultTabForMode,
  isWalkInHistoryMode,
  parsePickupTab,
  parseRepairTab,
  parseSalesTab,
  parseWalkInHistoryMode,
} from '@/lib/walk-in/history-modes';

test('parseWalkInHistoryMode defaults to sales', () => {
  assert.equal(parseWalkInHistoryMode(null), DEFAULT_WALK_IN_HISTORY_MODE);
  assert.equal(parseWalkInHistoryMode(''), 'sales');
  assert.equal(parseWalkInHistoryMode('nope'), 'sales');
});

test('parseWalkInHistoryMode accepts the three modes', () => {
  assert.equal(parseWalkInHistoryMode('pickup'), 'pickup');
  assert.equal(parseWalkInHistoryMode('sales'), 'sales');
  assert.equal(parseWalkInHistoryMode('repair'), 'repair');
});

test('parseWalkInHistoryMode maps legacy category values', () => {
  assert.equal(parseWalkInHistoryMode('pickups'), 'pickup');
  assert.equal(parseWalkInHistoryMode('repairs'), 'repair');
  assert.equal(parseWalkInHistoryMode('all'), 'sales');
});

test('mode items are ordered Local Pickup · Sales · Repair', () => {
  assert.deepEqual(
    WALK_IN_HISTORY_MODE_ITEMS.map((i) => i.id),
    ['pickup', 'sales', 'repair'],
  );
  assert.deepEqual([...WALK_IN_HISTORY_MODES], ['pickup', 'sales', 'repair']);
});

test('only repair mode carries an extra permission', () => {
  assert.equal(WALK_IN_MODE_PERMISSION.pickup, null);
  assert.equal(WALK_IN_MODE_PERMISSION.sales, null);
  assert.equal(WALK_IN_MODE_PERMISSION.repair, 'repair.view');
});

test('per-mode tab parsers default correctly', () => {
  assert.equal(parsePickupTab(null), DEFAULT_PICKUP_TAB);
  assert.equal(parsePickupTab('draft'), 'draft');
  assert.equal(parsePickupTab('bogus'), 'completed');
  assert.equal(parseSalesTab(null), DEFAULT_SALES_TAB);
  assert.equal(parseSalesTab('all'), 'all');
  assert.equal(parseRepairTab(null), DEFAULT_REPAIR_TAB);
  assert.equal(parseRepairTab('done'), 'done');
  assert.equal(parseRepairTab('bogus'), 'active');
});

test('defaultTabForMode matches the per-mode defaults', () => {
  assert.equal(defaultTabForMode('pickup'), 'completed');
  assert.equal(defaultTabForMode('sales'), 'today');
  assert.equal(defaultTabForMode('repair'), 'active');
});

test('pickup tab maps to the API status', () => {
  assert.equal(PICKUP_TAB_STATUS.draft, 'DRAFT');
  assert.equal(PICKUP_TAB_STATUS.completed, 'COMPLETED');
});

test('isWalkInHistoryMode guards the union', () => {
  assert.equal(isWalkInHistoryMode('pickup'), true);
  assert.equal(isWalkInHistoryMode('pickups'), false);
  assert.equal(isWalkInHistoryMode(null), false);
});
