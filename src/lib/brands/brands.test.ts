import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSkuBrand, createBrand, updateBrand } from './brands';
import { MemBrandDb } from './mem-store.fixture';
import { seedBrands } from './seed';

const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';

test('create: name + aliases become normalised, deduped aliases of the new brand', async () => {
  const db = new MemBrandDb();
  const r = await createBrand(db.store(ORG_A), { name: 'Bose', aliases: ['BOSE', 'Bose Corp', 'boser', ' Boser '] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.aliases.map((a) => a.normalizedAlias).sort(), ['bose', 'bose corp', 'boser']);
  assert.equal(r.brand.slug, 'bose');
  assert.equal(r.brand.normalizedName, 'bose');
});

test('create: an alias owned by another brand is a 409 naming the owner, and nothing is written', async () => {
  const db = new MemBrandDb();
  const bose = db.addBrand(ORG_A, { name: 'Bose' }, ['qc']);
  const writes = db.writes;
  const r = await createBrand(db.store(ORG_A), { name: 'QuietComfort Clone', aliases: ['QC'] });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, 409);
  assert.deepEqual(r.collisions?.map((c) => [c.normalizedAlias, c.ownerBrandId]), [['qc', bose.id]]);
  assert.equal(db.writes, writes);
});

test('create: a brand name that is already another brand’s alias collides too', async () => {
  const db = new MemBrandDb();
  db.addBrand(ORG_A, { name: 'Bose' }, ['boser']);
  const r = await createBrand(db.store(ORG_A), { name: 'Boser' });
  assert.equal(r.ok ? 200 : r.status, 409);
});

test('create: the same alias in ANOTHER org is not a collision (per-org vocabulary)', async () => {
  const db = new MemBrandDb();
  db.addBrand(ORG_B, { name: 'Bose' }, ['qc']);
  const r = await createBrand(db.store(ORG_A), { name: 'Bose', aliases: ['QC'] });
  assert.equal(r.ok, true);
  assert.equal(db.brands.filter((b) => b.orgId === ORG_A).length, 1);
});

test('create: a product_line needs a parent, and the parent must be in this org', async () => {
  const db = new MemBrandDb();
  const foreign = db.addBrand(ORG_B, { name: 'Bose' });
  const noParent = await createBrand(db.store(ORG_A), { name: 'Wave', kind: 'product_line' });
  assert.equal(noParent.ok ? 200 : noParent.status, 400);
  const otherOrgParent = await createBrand(db.store(ORG_A), { name: 'Wave', kind: 'product_line', parentBrandId: foreign.id });
  assert.equal(otherOrgParent.ok ? 200 : otherOrgParent.status, 404);
  assert.equal(db.writes, 0);
});

test('update: re-parenting under a descendant is refused as a cycle', async () => {
  const db = new MemBrandDb();
  const bose = db.addBrand(ORG_A, { name: 'Bose' });
  const wave = db.addBrand(ORG_A, { name: 'Wave', kind: 'product_line', parentBrandId: bose.id });
  const r = await updateBrand(db.store(ORG_A), bose.id, { parentBrandId: wave.id });
  assert.equal(r.ok ? 200 : r.status, 400);
  const self = await updateBrand(db.store(ORG_A), bose.id, { parentBrandId: bose.id });
  assert.equal(self.ok ? 200 : self.status, 400);
});

test('update: the tree is capped at 4 levels', async () => {
  const db = new MemBrandDb();
  const a = db.addBrand(ORG_A, { name: 'A' });
  const b = db.addBrand(ORG_A, { name: 'B', parentBrandId: a.id });
  const c = db.addBrand(ORG_A, { name: 'C', parentBrandId: b.id });
  const d = db.addBrand(ORG_A, { name: 'D', parentBrandId: c.id });
  const e = db.addBrand(ORG_A, { name: 'E' });
  const r = await updateBrand(db.store(ORG_A), e.id, { parentBrandId: d.id });
  assert.equal(r.ok ? 200 : r.status, 400);
  const ok = await updateBrand(db.store(ORG_A), e.id, { parentBrandId: c.id });
  assert.equal(ok.ok, true);
});

test('update: rename keeps the old name as an alias and claims the new one', async () => {
  const db = new MemBrandDb();
  const b = db.addBrand(ORG_A, { name: 'Bose Corp', normalizedName: 'bose corp' });
  const r = await updateBrand(db.store(ORG_A), b.id, { name: 'Bose' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.brand.name, 'Bose');
  assert.deepEqual(r.aliases.map((a) => a.normalizedAlias).sort(), ['bose', 'bose corp']);
  assert.deepEqual(db.refreshed, [{ orgId: ORG_A, brandIds: [b.id] }]);
});

test('update: a brand cannot drop its own name alias, nor an alias it does not own', async () => {
  const db = new MemBrandDb();
  const bose = db.addBrand(ORG_A, { name: 'Bose' }, ['boser']);
  db.addBrand(ORG_A, { name: 'Sony' });
  const own = await updateBrand(db.store(ORG_A), bose.id, { aliasesRemove: ['BOSE'] });
  assert.equal(own.ok ? 200 : own.status, 400);
  const foreign = await updateBrand(db.store(ORG_A), bose.id, { aliasesRemove: ['sony'] });
  assert.equal(foreign.ok ? 200 : foreign.status, 400);
  assert.equal(db.writes, 0);
  const ok = await updateBrand(db.store(ORG_A), bose.id, { aliasesRemove: ['Boser'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(db.aliases.filter((a) => a.brandId === bose.id).map((a) => a.normalizedAlias), ['bose']);
});

test('update: adding an alias another brand owns is a 409; re-adding an own alias is a no-op', async () => {
  const db = new MemBrandDb();
  const bose = db.addBrand(ORG_A, { name: 'Bose' }, ['qc']);
  const sony = db.addBrand(ORG_A, { name: 'Sony' });
  const clash = await updateBrand(db.store(ORG_A), sony.id, { aliasesAdd: ['QC', 'Sony Corp'] });
  assert.equal(clash.ok ? 200 : clash.status, 409);
  assert.equal(db.aliases.some((a) => a.normalizedAlias === 'sony corp'), false, 'a refusal writes nothing');
  const again = await updateBrand(db.store(ORG_A), bose.id, { aliasesAdd: ['qc'] });
  assert.equal(again.ok && again.changed, false);
  assert.deepEqual(db.refreshed, []);
});

test('update: a brand of another org is not found', async () => {
  const db = new MemBrandDb();
  const foreign = db.addBrand(ORG_B, { name: 'Bose' });
  const r = await updateBrand(db.store(ORG_A), foreign.id, { name: 'Mine now' });
  assert.equal(r.ok ? 200 : r.status, 404);
  assert.equal(foreign.name, 'Bose');
});

test('assignSkuBrand: approval stamps a human fact and returns the prior triple for revert', async () => {
  const db = new MemBrandDb();
  const bose = db.addBrand(ORG_A, { name: 'Bose' });
  db.skus.push({ orgId: ORG_A, id: 7, sku: '00007', isActive: true, brand: { brandId: null, confidence: null, source: null } });
  const r = await assignSkuBrand(db.store(ORG_A), { skuCatalogId: 7, brandId: bose.id });
  assert.deepEqual(r, {
    ok: true,
    previous: { brandId: null, confidence: null, source: null },
    next: { brandId: bose.id, confidence: 1, source: 'operator' },
  });
  const retired = db.addBrand(ORG_A, { name: 'Old', isActive: false });
  const refused = await assignSkuBrand(db.store(ORG_A), { skuCatalogId: 7, brandId: retired.id });
  assert.equal(refused.ok ? 200 : refused.status, 400);
  const foreignSku = await assignSkuBrand(db.store(ORG_B), { skuCatalogId: 7, brandId: null });
  assert.equal(foreignSku.ok ? 200 : foreignSku.status, 404);
});

test('seedBrands is idempotent and never re-points an alias another brand owns', async () => {
  const db = new MemBrandDb();
  db.addBrand(ORG_A, { name: 'Sony' }, ['boser']); // someone already claimed the misspelling
  const spec = [
    {
      name: 'Bose',
      kind: 'brand' as const,
      aliases: ['Boser', 'Bose Corp'],
      reviewOnlyAliases: ['RC'],
      children: [{ name: 'Wave', kind: 'product_line' as const, aliases: ['Bose Wave'] }],
    },
  ];
  const first = await seedBrands(db.store(ORG_A), spec);
  assert.deepEqual(first.map((o) => [o.name, o.action]), [['Bose', 'created'], ['Wave', 'created']]);
  assert.deepEqual(first[0]!.conflicts, ['boser → Sony']);
  const bose = db.brands.find((b) => b.name === 'Bose')!;
  assert.equal(db.brands.find((b) => b.name === 'Wave')!.parentBrandId, bose.id);
  assert.equal(db.aliases.find((a) => a.normalizedAlias === 'rc')!.reviewOnly, true);
  assert.equal(db.aliases.find((a) => a.normalizedAlias === 'boser')!.brandId, db.brands.find((b) => b.name === 'Sony')!.id);

  const writes = db.writes;
  const second = await seedBrands(db.store(ORG_A), spec);
  assert.deepEqual(second.map((o) => o.action), ['unchanged', 'unchanged']);
  assert.equal(db.writes, writes);
});
