import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brandCoverage,
  planSkuBrands,
  runBrandBackfill,
  type BackfillSku,
  type BrandAliasEntry,
  type BrandBackfillDeps,
} from './backfill';

const ORG = '00000000-0000-0000-0000-000000000001';
const BOSE = 1;
const WAVE = 2;
const SONY = 3;
const ROCK_BAND = 4;
const SOUNDLINK = 5;
const PANASONIC = 6;

const entry = (normalizedAlias: string, brandId: number, brandName: string, kind: BrandAliasEntry['kind'], rootBrandId = brandId, reviewOnly = false): BrandAliasEntry => ({
  normalizedAlias,
  brandId,
  brandName,
  kind,
  rootBrandId,
  reviewOnly,
});

const ALIASES: BrandAliasEntry[] = [
  entry('bose', BOSE, 'Bose', 'brand'),
  entry('boser', BOSE, 'Bose', 'brand'),
  entry('bose corp', BOSE, 'Bose', 'brand'),
  entry('wave', WAVE, 'Wave', 'product_line', BOSE),
  entry('bose wave', WAVE, 'Wave', 'product_line', BOSE),
  entry('sony', SONY, 'Sony', 'brand'),
  entry('rock band', ROCK_BAND, 'Rock Band', 'franchise'),
  entry('beatles rock band', ROCK_BAND, 'Rock Band', 'franchise'),
  entry('soundlink', SOUNDLINK, 'SoundLink', 'product_line', BOSE),
  entry('sl', SOUNDLINK, 'SoundLink', 'product_line', BOSE, true),
  entry('panasonic', PANASONIC, 'Panasonic', 'brand'),
];

let nextId = 100;
function sku(over: Partial<BackfillSku> & { sku: string }): BackfillSku {
  return {
    skuCatalogId: nextId++,
    isActive: true,
    zohoItemTitle: null,
    catalogProductTitle: null,
    zohoBrand: null,
    zohoManufacturer: null,
    listingTitles: [],
    current: { brandId: null, confidence: null, source: null },
    ...over,
  };
}

function planOf(row: BackfillSku, others: BackfillSku[] = []) {
  const { plans } = planSkuBrands([row, ...others], ALIASES);
  return plans.find((p) => p.skuCatalogId === row.skuCatalogId)!;
}

test('title brand/franchise auto-applies at 0.95 from the leading tokens after stop words', () => {
  const p = planOf(sku({ sku: '00054', catalogProductTitle: 'The Beatles Rock Band Drum Kit' }));
  assert.deepEqual([p.apply?.brandId, p.apply?.source, p.apply?.confidence], [ROCK_BAND, 'title', 0.95]);
  const oem = planOf(sku({ sku: '00001', catalogProductTitle: 'Genuine OEM Boser 161 speaker' }));
  assert.deepEqual([oem.apply?.brandId, oem.apply?.confidence], [BOSE, 0.95]);
});

test('the identity title is tokenised: the catalog title remains authoritative', () => {
  const p = planOf(sku({ sku: '00033', zohoItemTitle: 'Panasonic RR-US570 recorder', catalogProductTitle: 'Bose Wave remote' }));
  assert.equal(p.apply?.brandId, WAVE);
});

test('a product_line alias applies the LINE at 0.90; the longest alias wins ("bose wave" over "bose")', () => {
  const lead = planOf(sku({ sku: '00200', catalogProductTitle: 'Wave Radio CD player' }));
  assert.deepEqual([lead.apply?.brandId, lead.apply?.source, lead.apply?.confidence], [WAVE, 'product_line', 0.9]);
  const bigram = planOf(sku({ sku: '00201', catalogProductTitle: 'Bose Wave Music System' }));
  assert.equal(bigram.apply?.brandId, WAVE);
});

test('Zoho brand governs at 1.00; a disagreeing title is queued, not applied', () => {
  const p = planOf(sku({ sku: '00300', zohoBrand: 'Sony Corporation', catalogProductTitle: 'Bose remote' }));
  assert.deepEqual([p.apply?.brandId, p.apply?.source, p.apply?.confidence], [SONY, 'zoho', 1]);
  assert.deepEqual(p.proposals.map((x) => [x.brandId, x.reason]), [[BOSE, 'conflict_with_zoho']]);
  // Same root (Zoho Bose, title Wave line) is agreement, not a conflict.
  const agree = planOf(sku({ sku: '00301', zohoManufacturer: 'Bose Corp', catalogProductTitle: 'Wave radio' }));
  assert.equal(agree.apply?.brandId, BOSE);
  assert.deepEqual(agree.proposals, []);
});

test('an unknown Zoho brand never falls back to the title; it becomes one brand.create proposal', () => {
  const a = sku({ sku: '00400', zohoBrand: 'Acme Audio', catalogProductTitle: 'Bose cable' });
  const b = sku({ sku: '00401', zohoBrand: 'ACME AUDIO Inc', catalogProductTitle: 'Acme amp' });
  const { plans, zohoBrandCreates } = planSkuBrands([a, b], ALIASES);
  assert.ok(plans.every((p) => p.apply === null));
  assert.deepEqual(zohoBrandCreates.map((c) => [c.normalizedName, c.skuCatalogIds]), [['acme audio', [a.skuCatalogId, b.skuCatalogId]]]);
});

test('listing titles are review-only (0.60) and never auto-apply', () => {
  const p = planOf(sku({ sku: '00500', catalogProductTitle: 'Remote control unit', listingTitles: ['Sony RM-X remote'] }));
  assert.equal(p.apply, null);
  assert.deepEqual(p.proposals.map((x) => [x.brandId, x.source, x.confidence, x.reason]), [[SONY, 'listing', 0.6, 'below_threshold']]);
});

test('a title brand contradicted by a listing (different root) still applies; the listing pair is queued', () => {
  const p = planOf(sku({ sku: '00095', catalogProductTitle: 'Rock Band guitar', listingTitles: ['Bose CineMate GS remote', 'Rock Band 4 guitar'] }));
  assert.deepEqual([p.apply?.brandId, p.apply?.source], [ROCK_BAND, 'title']);
  assert.deepEqual(p.proposals.map((x) => [x.brandId, x.source, x.reason]), [[BOSE, 'listing', 'conflict']]);
});

test('a compatibility mention proposes NO brand (0.30) — the target is not the brand', () => {
  const p = planOf(sku({ sku: '00600', catalogProductTitle: 'Replacement CD drive for Bose Wave' }));
  assert.equal(p.apply, null);
  assert.equal(p.proposals.length, 1);
  assert.deepEqual([p.proposals[0]!.brandId, p.proposals[0]!.compatBrandId, p.proposals[0]!.confidence], [null, WAVE, 0.3]);
});

test('an ambiguous (review-only) alias is queued at 0.60', () => {
  const p = planOf(sku({ sku: '00700', catalogProductTitle: 'SL speaker cover' }));
  assert.equal(p.apply, null);
  assert.deepEqual(p.proposals.map((x) => [x.brandId, x.reason, x.confidence]), [[SOUNDLINK, 'review_only_alias', 0.6]]);
});

test('parent SKU inheritance needs a >= 0.95 parent: title parent yes, product_line parent no', () => {
  const parent = sku({ sku: '00041', catalogProductTitle: 'Bose Acoustimass 5 module' });
  const child = sku({ sku: '00041-P-1', catalogProductTitle: 'Grill cloth' });
  const inherited = planOf(child, [parent]);
  assert.deepEqual([inherited.apply?.brandId, inherited.apply?.source, inherited.apply?.confidence], [BOSE, 'parent', 0.9]);

  const lineParent = sku({ sku: '00050', catalogProductTitle: 'Wave radio' });
  const lineChild = sku({ sku: '00050-BK', catalogProductTitle: 'Black cover' });
  assert.equal(planOf(lineChild, [lineParent]).apply, null);
});

test('authority: a derived brand never overwrites an operator fact, and unchanged rows are not rewritten', () => {
  const operator = planOf(sku({ sku: '00800', catalogProductTitle: 'Sony remote', current: { brandId: BOSE, confidence: 1, source: 'operator' } }));
  assert.equal(operator.apply, null);
  assert.equal(operator.kept, 'protected');
  assert.equal(operator.finalBrandId, BOSE);

  const same = planOf(sku({ sku: '00801', catalogProductTitle: 'Sony remote', current: { brandId: SONY, confidence: 0.95, source: 'title' } }));
  assert.equal(same.apply, null);
  assert.equal(same.kept, 'unchanged');

  // A re-derivation at the same authority (alias edited) does rewrite.
  const moved = planOf(sku({ sku: '00802', catalogProductTitle: 'Sony remote', current: { brandId: BOSE, confidence: 0.95, source: 'title' } }));
  assert.equal(moved.apply?.brandId, SONY);
});

test('coverage counts facts after the run per population, fixtures excluded where asked', () => {
  const { plans } = planSkuBrands(
    [
      sku({ sku: '00900', catalogProductTitle: 'Bose Solo 5' }),
      sku({ sku: '00901', catalogProductTitle: 'Set of 5 - 16 Gauge wire' }),
      sku({ sku: 'E2E-1', catalogProductTitle: 'E2E fixture' }),
      sku({ sku: '00902', catalogProductTitle: 'Sony remote', isActive: false }),
    ],
    ALIASES,
  );
  const byPop = Object.fromEntries(brandCoverage(plans).map((c) => [c.population, [c.branded, c.total]]));
  assert.deepEqual(byPop, { all: [2, 4], non_fixture: [2, 3], active: [1, 3], active_non_fixture: [1, 2] });
});

function runnerDeps(skus: BackfillSku[], queuedKeys: string[] = []) {
  const cap = { writes: [] as unknown[], proposals: [] as Array<{ kind: string; payload: Record<string, unknown> }> };
  const deps: BrandBackfillDeps = {
    loadAliases: async () => ALIASES,
    loadSkus: async () => skus,
    loadProposalKeys: async () => new Set(queuedKeys),
    writeBrands: async (_org, rows) => {
      cap.writes.push(rows);
      return rows.length;
    },
    propose: async (_org, kind, payload) => {
      cap.proposals.push({ kind, payload });
      return { ok: true };
    },
  };
  return { deps, cap };
}

test('runner dry run plans and reports but writes and proposes nothing', async () => {
  const { deps, cap } = runnerDeps([sku({ sku: '01000', catalogProductTitle: 'Bose Solo' }), sku({ sku: '01001', catalogProductTitle: 'x', listingTitles: ['Sony remote'] })]);
  const report = await runBrandBackfill(ORG, { apply: false }, deps);
  assert.equal(report.toApply, 1);
  assert.equal(report.proposals.new, 1);
  assert.deepEqual(cap.writes, []);
  assert.deepEqual(cap.proposals, []);
});

test('runner --apply writes >= 0.90 rows in one batch and queues only proposals not seen before', async () => {
  const seen = sku({ sku: '01101', catalogProductTitle: 'x', listingTitles: ['Sony remote'] });
  const fresh = sku({ sku: '01102', catalogProductTitle: 'y', listingTitles: ['Panasonic deck'] });
  const seenKey = `sku_brand:${seen.skuCatalogId}:${SONY}:listing:below_threshold`;
  const { deps, cap } = runnerDeps([sku({ sku: '01100', catalogProductTitle: 'Bose Solo' }), seen, fresh], [seenKey]);
  const report = await runBrandBackfill(ORG, { apply: true }, deps);
  assert.equal(cap.writes.length, 1);
  assert.deepEqual((cap.writes[0] as Array<{ source: string; confidence: number }>).map((r) => [r.source, r.confidence]), [['title', 0.95]]);
  assert.deepEqual(cap.proposals.map((p) => [p.kind, p.payload.skuCatalogId, p.payload.brandId]), [['sku_brand.assign', fresh.skuCatalogId, PANASONIC]]);
  assert.equal(report.proposals.alreadyQueued, 1);
  assert.equal(report.written, 1);
});
