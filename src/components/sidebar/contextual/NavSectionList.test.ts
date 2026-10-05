import assert from 'node:assert/strict';
import test from 'node:test';
import { Package, Warehouse } from '@/components/Icons';
import type { NavItem } from '@/lib/nav/context/schema';
import { navRowGlyph } from './NavSectionList';

const stockDoor: NavItem = {
  id: 'stock',
  label: 'Warehouse',
  href: '/inventory/stock',
  active: false,
  kind: 'drill',
};

test('Warehouse lane door wears the warehouse parent icon', () => {
  assert.equal(navRowGlyph(stockDoor, undefined)?.icon, Warehouse);
});

test('Stock page row keeps the stock package icon', () => {
  assert.equal(navRowGlyph({ ...stockDoor, label: 'Stock' }, undefined)?.icon, Package);
});
