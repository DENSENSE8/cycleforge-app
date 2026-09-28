import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SIDEBAR_NAV } from '@/lib/sidebar-navigation';
import { CAPABILITIES, hiddenNavItemIds, resolveCapability } from './catalog';

test('every sidebar row is owned by a capability (an unowned row would never be gated)', () => {
  const owned = new Set(CAPABILITIES.flatMap((c) => c.navItemIds));
  const unowned = APP_SIDEBAR_NAV.map((i) => i.id).filter((id) => !owned.has(id));
  assert.deepEqual(unowned, []);
});

test('a chat-only org sees only the base rows; unlocking purchase orders reveals its lane', () => {
  const hidden = new Set(hiddenNavItemIds([]));
  for (const id of ['ai-chat', 'settings', 'search']) assert.ok(!hidden.has(id), id);
  for (const id of ['incoming', 'outbound', 'products', 'home']) assert.ok(hidden.has(id), id);
  const after = new Set(hiddenNavItemIds(['purchase_orders']));
  assert.ok(!after.has('incoming') && !after.has('sourcing'));
  assert.ok(after.has('outbound'));
});

test('a row shared by two capabilities shows while either is active', () => {
  assert.ok(!hiddenNavItemIds(['ebay_import']).includes('products'));
  assert.ok(!hiddenNavItemIds(['products']).includes('products'));
});

test('operator words resolve to one capability; the longest keyword wins', () => {
  assert.equal(resolveCapability('purchase orders')?.id, 'purchase_orders');
  assert.equal(resolveCapability('I need to record outbound orders')?.id, 'outbound_orders');
  assert.equal(resolveCapability('import my ebay listings')?.id, 'ebay_import');
  assert.equal(resolveCapability('a customer intake counter')?.id, 'customer_counter');
  assert.equal(resolveCapability('teleportation'), null);
});
