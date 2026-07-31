/**
 * Pure retail-catalog filters — no DB.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRetailProducts, resolveRetailCategoryLevelFrom } from './sales-catalog-pure';
import type { EcwidCategory, EcwidProduct } from '@/lib/repair/ecwid-repair-catalog';

test('filterRetailProducts drops -RS SKUs and keeps retail', () => {
  const products: EcwidProduct[] = [
    {
      id: '1',
      name: 'Repair QC45',
      sku: '00958-RS',
      price: 130,
      thumbnailUrl: null,
      enabled: true,
      inStock: true,
      categoryIds: ['r1'],
    },
    {
      id: '2',
      name: 'Earbud tips',
      sku: 'TIP-01',
      price: 9.99,
      thumbnailUrl: null,
      enabled: true,
      inStock: true,
      categoryIds: ['c1'],
    },
  ];
  const kept = filterRetailProducts(products);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.sku, 'TIP-01');
});

test('resolveRetailCategoryLevelFrom excludes repair roots at the top level', () => {
  const categories: EcwidCategory[] = [
    { id: 'repair-root', parentId: null, name: 'Bose Repair Service' },
    { id: 'repair-child', parentId: 'repair-root', name: 'Headphones' },
    { id: 'retail-root', parentId: null, name: 'Accessories' },
    { id: 'retail-child', parentId: 'retail-root', name: 'Tips' },
  ];

  const level = resolveRetailCategoryLevelFrom(categories, null);
  const ids = level.categories.map((c) => c.id);
  assert.ok(ids.includes('retail-root'));
  assert.ok(!ids.includes('repair-root'));
});
