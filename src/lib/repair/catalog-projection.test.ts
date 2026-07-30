import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProjectedCategories,
  fromProjectedListing,
  toMajorUnits,
  toMinorUnits,
  toProjectedListing,
} from './catalog-projection';
import {
  filterRepairRootProducts,
  resolveRepairCategoryLevelFrom,
  type EcwidCategory,
  type EcwidProduct,
} from './ecwid-repair-catalog';

function product(patch: Partial<EcwidProduct> = {}): EcwidProduct {
  return {
    id: 'P1',
    name: 'QC35 Repair',
    sku: '00958-RS',
    price: 130,
    thumbnailUrl: 'http://t/1.jpg',
    enabled: true,
    inStock: true,
    categoryIds: ['C3'],
    ...patch,
  };
}

/** C1 (repair root) → C2 → C3, plus an unrelated D1 branch. */
function tree(): EcwidCategory[] {
  return [
    { id: 'C1', parentId: null, name: 'Bose Repair Service' },
    { id: 'C2', parentId: 'C1', name: 'Headphones' },
    { id: 'C3', parentId: 'C2', name: 'QC35' },
    { id: 'D1', parentId: null, name: 'Accessories' },
    { id: 'D2', parentId: 'D1', name: 'Cables' },
  ];
}

// ── Unit conversion ─────────────────────────────────────────────────────────

test('major→minor rounds rather than truncating', () => {
  // 19.99 * 100 is 1998.9999... in IEEE-754; truncation would underprice by a cent.
  assert.equal(toMinorUnits(19.99), 1999);
  assert.equal(toMinorUnits(130), 13000);
  assert.equal(toMinorUnits(0), 0);
});

test('a missing or nonsensical price projects as null, not 0', () => {
  // 0 would read as "free" on a receipt; null reads as "unpriced".
  for (const value of [null, undefined, Number.NaN, -5, Number.POSITIVE_INFINITY]) {
    assert.equal(toMinorUnits(value as number | null), null, `${String(value)}`);
  }
});

test('minor→major is the inverse for real prices', () => {
  for (const dollars of [0, 1, 19.99, 130, 4999.95]) {
    assert.equal(toMajorUnits(toMinorUnits(dollars)), dollars);
  }
});

// ── Listing round trip: the byte-identical shape contract ───────────────────

test('a product survives a projection round trip unchanged', () => {
  // ProductSelector and both ecwid-products routes consume this shape. If a
  // field changes here, those surfaces change without their code being touched.
  const original = product();
  const stored = toProjectedListing(original);
  const back = fromProjectedListing({
    external_ref_id: stored.externalRefId,
    merchant_sku: stored.merchantSku,
    listed_name: stored.listedName,
    listing_price_cents: stored.listingPriceCents,
    thumbnail_url: stored.thumbnailUrl,
    in_stock: stored.inStock,
    is_active: stored.isActive,
    category_external_ids: stored.categoryExternalIds,
  });
  assert.deepEqual(back, original);
});

test('an unpriced product round trips as price null, never 0', () => {
  const stored = toProjectedListing(product({ price: null }));
  assert.equal(stored.listingPriceCents, null);
  const back = fromProjectedListing({
    external_ref_id: 'P1',
    merchant_sku: 'X',
    listed_name: 'X',
    listing_price_cents: null,
    thumbnail_url: null,
    in_stock: true,
    is_active: true,
    category_external_ids: [],
  });
  assert.equal(back.price, null);
});

test('duplicate category ids are collapsed on write', () => {
  const stored = toProjectedListing(product({ categoryIds: ['C2', 'C3', 'C2'] }));
  assert.deepEqual(stored.categoryExternalIds, ['C2', 'C3']);
});

test('a nameless row still gets a usable label, and a NULL category array reads as empty', () => {
  const back = fromProjectedListing({
    external_ref_id: 'P9',
    merchant_sku: null,
    listed_name: '   ',
    listing_price_cents: 100,
    thumbnail_url: null,
    in_stock: false,
    is_active: true,
    category_external_ids: null,
  });
  assert.equal(back.name, 'Product P9');
  assert.equal(back.sku, '');
  assert.deepEqual(back.categoryIds, []);
});

// ── Category projection ─────────────────────────────────────────────────────

test('depth and full_path are computed from the parent chain', () => {
  const rows = buildProjectedCategories(tree());
  const byId = new Map(rows.map((r) => [r.externalId, r]));

  assert.equal(byId.get('C1')!.depth, 0);
  assert.equal(byId.get('C1')!.fullPath, 'Bose Repair Service');
  assert.equal(byId.get('C3')!.depth, 2);
  assert.equal(byId.get('C3')!.fullPath, 'Bose Repair Service > Headphones > QC35');
  assert.equal(byId.get('C3')!.parentExternalId, 'C2');
  assert.equal(byId.get('C1')!.parentExternalId, null);
});

test('numeric provider ids normalize to strings', () => {
  const rows = buildProjectedCategories([
    { id: 10, parentId: null, name: 'Root' },
    { id: 11, parentId: 10, name: 'Child' },
  ]);
  const child = rows.find((r) => r.externalId === '11');
  assert.equal(child?.parentExternalId, '10');
  assert.equal(child?.fullPath, 'Root > Child');
});

test('a parent cycle terminates instead of spinning, keeping the partial path', () => {
  // A provider reporting A→B→A must not hang the writer, and a mis-parented
  // category should stay navigable rather than vanish.
  const rows = buildProjectedCategories([
    { id: 'A', parentId: 'B', name: 'Alpha' },
    { id: 'B', parentId: 'A', name: 'Beta' },
  ]);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok(row.fullPath.length > 0, 'a cycled node still carries a path');
    assert.ok(Number.isFinite(row.depth));
  }
});

test('a category with no id is dropped, and a nameless one gets a fallback label', () => {
  const rows = buildProjectedCategories([
    { id: null, parentId: null, name: 'ghost' },
    { id: 'Z1', parentId: null, name: '  ' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].externalId, 'Z1');
  assert.equal(rows[0].name, 'Category Z1');
});

test('duplicate provider rows collapse to one projected row', () => {
  // The natural-key upsert would dedupe anyway; not sending both saves the write.
  const rows = buildProjectedCategories([
    { id: 'C1', parentId: null, name: 'First' },
    { id: 'C1', parentId: null, name: 'Second' },
  ]);
  assert.equal(rows.length, 1);
});

// ── The projected rows drive the SAME level assembly as the live walk ───────

test('projected categories assemble a level with breadcrumbs and leaf flags', () => {
  process.env.ECWID_REPAIR_CATEGORY_IDS = 'C1';
  try {
    const level = resolveRepairCategoryLevelFrom(tree(), 'C2');
    assert.equal(level.currentParentId, 'C2');
    assert.deepEqual(level.breadcrumbs.map((b) => b.id), ['C1', 'C2']);
    assert.deepEqual(level.categories.map((c) => c.id), ['C3']);
    const leaf = level.categories[0];
    assert.equal(leaf.isLeaf, true);
    assert.equal(leaf.hasChildren, false);
    assert.equal(leaf.depth, 2);
    assert.equal(leaf.fullPath, 'Bose Repair Service > Headphones > QC35');
  } finally {
    delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  }
});

test('the root level lists the repair root children, not the whole store', () => {
  process.env.ECWID_REPAIR_CATEGORY_IDS = 'C1';
  try {
    const level = resolveRepairCategoryLevelFrom(tree(), null);
    assert.deepEqual(level.categories.map((c) => c.id), ['C2']);
    assert.equal(level.currentParentId, null);
    assert.deepEqual(level.breadcrumbs, []);
  } finally {
    delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  }
});

test('a parentId outside the repair subtree is ignored, never honored', () => {
  // Otherwise the picker could be walked out of the repair tree into the store.
  process.env.ECWID_REPAIR_CATEGORY_IDS = 'C1';
  try {
    const level = resolveRepairCategoryLevelFrom(tree(), 'D1');
    assert.equal(level.currentParentId, null, 'fell back to the repair root level');
    assert.deepEqual(level.categories.map((c) => c.id), ['C2']);
  } finally {
    delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  }
});

test('an EMPTY category branch still renders — the reason the tree is its own table', () => {
  // C2 holds no products at all. A listing-shaped store could not represent it.
  process.env.ECWID_REPAIR_CATEGORY_IDS = 'C1';
  try {
    const level = resolveRepairCategoryLevelFrom(
      [
        { id: 'C1', parentId: null, name: 'Bose Repair Service' },
        { id: 'C2', parentId: 'C1', name: 'Empty Branch' },
      ],
      null,
    );
    assert.deepEqual(level.categories.map((c) => c.name), ['Empty Branch']);
  } finally {
    delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  }
});

test('no resolvable repair root yields a teaching message, not a silent empty level', () => {
  delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  const level = resolveRepairCategoryLevelFrom(
    [{ id: 'X1', parentId: null, name: 'Something Else' }],
    null,
  );
  assert.deepEqual(level.categories, []);
  assert.match(String(level.message), /No repair root category found/);
});

// ── Product narrowing over projected rows ──────────────────────────────────

test('only products under a repair root survive the filter', () => {
  process.env.ECWID_REPAIR_CATEGORY_IDS = 'C1';
  try {
    const kept = filterRepairRootProducts(
      [
        product({ id: 'P1', name: 'Under repair', categoryIds: ['C3'] }),
        product({ id: 'P2', name: 'Accessory', categoryIds: ['D2'] }),
        product({ id: 'P3', name: 'Uncategorized', categoryIds: [] }),
      ],
      tree(),
    );
    assert.deepEqual(kept.map((p) => p.id), ['P1']);
  } finally {
    delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  }
});

test('results come back name-sorted, matching the live path', () => {
  process.env.ECWID_REPAIR_CATEGORY_IDS = 'C1';
  try {
    const kept = filterRepairRootProducts(
      [
        product({ id: 'P1', name: 'Zebra', categoryIds: ['C2'] }),
        product({ id: 'P2', name: 'Alpha', categoryIds: ['C3'] }),
      ],
      tree(),
    );
    assert.deepEqual(kept.map((p) => p.name), ['Alpha', 'Zebra']);
  } finally {
    delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  }
});

test('no resolvable repair root falls back to EVERY product, not an empty catalog', () => {
  // Preserves the live path's deliberate fallback: a misconfigured root should
  // show too much, never nothing.
  delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  const kept = filterRepairRootProducts(
    [product({ id: 'P1', name: 'B' }), product({ id: 'P2', name: 'A' })],
    [{ id: 'X1', parentId: null, name: 'Unrelated' }],
  );
  assert.deepEqual(kept.map((p) => p.name), ['A', 'B']);
});

test('a product in several repair categories is returned once', () => {
  process.env.ECWID_REPAIR_CATEGORY_IDS = 'C1';
  try {
    const kept = filterRepairRootProducts(
      [product({ id: 'P1', categoryIds: ['C2', 'C3'] })],
      tree(),
    );
    assert.equal(kept.length, 1);
  } finally {
    delete process.env.ECWID_REPAIR_CATEGORY_IDS;
  }
});
