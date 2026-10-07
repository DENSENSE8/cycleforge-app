import assert from 'node:assert/strict';
import test from 'node:test';
import { Package, ShelvingUnit, Warehouse } from '@/components/Icons';
import type { NavItem } from '@/lib/nav/context/schema';
import { navRowGlyph } from './NavSectionList';

const inventoryDoor: NavItem = {
  id: 'stock',
  label: 'Inventory',
  href: '/inventory/stock',
  active: false,
  kind: 'drill',
};

const warehouseDoor: NavItem = {
  id: 'inventory',
  label: 'Warehouse',
  href: '/inventory/locations',
  active: false,
  kind: 'drill',
};

test('Inventory lane door wears the shelf-rack parent icon', () => {
  assert.equal(navRowGlyph(inventoryDoor, undefined)?.icon, ShelvingUnit);
});

test('Warehouse lane door wears the warehouse parent icon', () => {
  assert.equal(navRowGlyph(warehouseDoor, undefined)?.icon, Warehouse);
});

test('Stock page row keeps the stock package icon', () => {
  assert.equal(navRowGlyph({ ...inventoryDoor, label: 'Stock' }, undefined)?.icon, Package);
});
