import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PICKUP_TAB,
  DEFAULT_REPAIR_TAB,
  DEFAULT_SALES_REPAIR_TAB,
  DEFAULT_SALES_TAB,
  DEFAULT_WALK_IN_HISTORY_MODE,
  PICKUP_TAB_STATUS,
  WALK_IN_HISTORY_MODES,
  WALK_IN_HISTORY_MODE_ITEMS,
  WALK_IN_MODE_PERMISSION,
  defaultRepairTabForSurface,
  defaultTabForMode,
  isSalesRepairsDesk,
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

test('parseWalkInHistoryMode accepts Local Pickup · Sales · Repairs', () => {
  assert.equal(parseWalkInHistoryMode('pickup'), 'pickup');
  assert.equal(parseWalkInHistoryMode('sales'), 'sales');
  assert.equal(parseWalkInHistoryMode('repairs'), 'repairs');
});

test('parseWalkInHistoryMode maps legacy category values', () => {
  assert.equal(parseWalkInHistoryMode('pickups'), 'pickup');
  // Singular + plural repair bookmarks → Sales Repairs history desk.
  assert.equal(parseWalkInHistoryMode('repairs'), 'repairs');
  assert.equal(parseWalkInHistoryMode('repair'), 'repairs');
  assert.equal(parseWalkInHistoryMode('all'), 'sales');
});

test('mode items are ordered Local Pickup · Sales · Repairs', () => {
  assert.deepEqual(
    WALK_IN_HISTORY_MODE_ITEMS.map((i) => i.id),
    ['pickup', 'sales', 'repairs'],
  );
  assert.deepEqual([...WALK_IN_HISTORY_MODES], ['pickup', 'sales', 'repairs']);
});

test('hub mode permissions — only Repairs needs repair.view', () => {
  assert.equal(WALK_IN_MODE_PERMISSION.pickup, null);
  assert.equal(WALK_IN_MODE_PERMISSION.sales, null);
  assert.equal(WALK_IN_MODE_PERMISSION.repairs, 'repair.view');
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
  assert.equal(parseRepairTab(null, DEFAULT_SALES_REPAIR_TAB), 'done');
  assert.equal(parseRepairTab('bogus', DEFAULT_SALES_REPAIR_TAB), 'done');
});

test('defaultTabForMode matches the per-mode defaults', () => {
  assert.equal(defaultTabForMode('pickup'), 'completed');
  assert.equal(defaultTabForMode('sales'), 'today');
  assert.equal(defaultTabForMode('repairs'), 'done');
});

test('Sales repairs desk vs station default tab', () => {
  const salesSp = new URLSearchParams('mode=repairs');
  assert.equal(isSalesRepairsDesk('/dashboard', salesSp), true);
  assert.equal(isSalesRepairsDesk('/repair', salesSp), false);
  assert.equal(defaultRepairTabForSurface('/dashboard', salesSp), 'done');
  assert.equal(defaultRepairTabForSurface('/repair', new URLSearchParams()), 'active');
});

test('pickup tab maps to the API status', () => {
  assert.equal(PICKUP_TAB_STATUS.draft, 'DRAFT');
  assert.equal(PICKUP_TAB_STATUS.completed, 'COMPLETED');
});

test('isWalkInHistoryMode guards the union', () => {
  assert.equal(isWalkInHistoryMode('pickup'), true);
  assert.equal(isWalkInHistoryMode('sales'), true);
  assert.equal(isWalkInHistoryMode('repairs'), true);
  assert.equal(isWalkInHistoryMode('repair'), false);
  assert.equal(isWalkInHistoryMode('pickups'), false);
  assert.equal(isWalkInHistoryMode(null), false);
});
