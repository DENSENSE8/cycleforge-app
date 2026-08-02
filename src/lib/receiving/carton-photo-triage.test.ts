import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCartonPhotoTriage,
  cartonPhotoBucketRows,
  type CartonPhotoInput,
} from '@/lib/receiving/carton-photo-triage';

const pkg = (over: Partial<CartonPhotoInput> = {}): CartonPhotoInput => ({
  id: 1,
  photoUrl: '/api/photos/1/content',
  photoType: 'receiving_package',
  ...over,
});
const unboxCarton = (over: Partial<CartonPhotoInput> = {}): CartonPhotoInput => ({
  id: 2,
  photoUrl: '/api/photos/2/content',
  photoType: 'receiving_unbox_carton',
  ...over,
});
const itemShot = (over: Partial<CartonPhotoInput> = {}): CartonPhotoInput => ({
  id: 3,
  photoUrl: '/api/photos/3/content',
  photoType: 'receiving_item',
  receivingLineId: 77,
  ...over,
});

test('box folds arrival + unbox-carton; item is the line-scoped bucket', () => {
  const m = buildCartonPhotoTriage([pkg(), unboxCarton(), itemShot()]);
  assert.equal(m.counts.box, 2);
  assert.equal(m.counts.item, 1);
  assert.equal(m.counts.all, 3);
  assert.deepEqual(
    m.box.map((r) => r.stage),
    ['arrival_package', 'unbox_carton'],
  );
  assert.equal(m.item[0]?.stage, 'unbox_item');
});

test('entity wins for lines — a package stamp on a line is still item evidence', () => {
  // A carton→line reassign can strand a package-typed row on a line. The
  // identity law says the ENTITY decides, so it must not show up under Box.
  const m = buildCartonPhotoTriage([itemShot({ photoType: 'receiving_package' })]);
  assert.equal(m.counts.item, 1);
  assert.equal(m.counts.box, 0);
});

test('the legacy `caption` alias still resolves a stage when photoType is absent', () => {
  const m = buildCartonPhotoTriage([
    { id: 9, photoUrl: '/x', caption: 'receiving_unbox_carton' },
  ]);
  assert.equal(m.box[0]?.stage, 'unbox_carton');
});

test('untyped legacy carton rows count as arrival evidence, not as unclassified', () => {
  const m = buildCartonPhotoTriage([pkg({ photoType: null, caption: null })]);
  assert.equal(m.counts.box, 1);
  assert.equal(m.counts.investigative, 0);
});

test('a stage the vocabulary cannot name lands in Investigative, never dropped', () => {
  // The pre-SoT mis-stamp: `receiving_item` on a RECEIVING (carton) link.
  const m = buildCartonPhotoTriage([pkg({ photoType: 'receiving_item' })]);
  assert.equal(m.counts.box, 0);
  assert.equal(m.counts.item, 0);
  assert.equal(m.counts.all, 1, 'it is still the carton’s photo');
  assert.deepEqual(m.investigative[0]?.trailReasons, ['unclassified']);
});

test('Investigative is a lens, not a partition — a claim photo stays in Exact too', () => {
  const m = buildCartonPhotoTriage([pkg({ hasClaimEvidence: true })]);
  assert.equal(m.counts.all, 1);
  assert.equal(m.counts.box, 1);
  assert.equal(m.counts.claim, 1);
  assert.equal(m.counts.investigative, 1);
  assert.deepEqual(m.investigative[0]?.trailReasons, ['claim']);
});

test('an unclaimed carton has an empty Investigative lane — a true statement', () => {
  const m = buildCartonPhotoTriage([pkg(), unboxCarton()]);
  assert.equal(m.counts.investigative, 0);
  assert.equal(m.counts.claim, 0);
});

test('claim and share reasons stack on one row', () => {
  const m = buildCartonPhotoTriage([
    pkg({ hasClaimEvidence: true, hasInsuranceShare: true }),
  ]);
  assert.deepEqual(m.investigative[0]?.trailReasons, ['claim', 'share']);
});

test('capture order is preserved — the list is an evidence timeline', () => {
  const m = buildCartonPhotoTriage([
    itemShot({ id: 1, photoUrl: '/a' }),
    pkg({ id: 2, photoUrl: '/b' }),
    unboxCarton({ id: 3, photoUrl: '/c' }),
  ]);
  assert.deepEqual(m.all.map((r) => r.url), ['/a', '/b', '/c']);
});

test('rows without a numeric id still get stable distinct keys', () => {
  // The read surface omits `id` so delete stays off; keys must not collide.
  const m = buildCartonPhotoTriage([
    { photoUrl: '/a', photoType: 'receiving_package' },
    { photoUrl: '/b', photoType: 'receiving_package' },
  ]);
  assert.equal(new Set(m.all.map((r) => r.key)).size, 2);
});

test('blank urls are dropped', () => {
  const m = buildCartonPhotoTriage([pkg({ photoUrl: '   ' }), pkg({ id: 2 })]);
  assert.equal(m.counts.all, 1);
});

test('null input is an empty model, not a throw', () => {
  const m = buildCartonPhotoTriage(null);
  assert.equal(m.counts.all, 0);
  assert.equal(m.aspectsUnwritten, true);
});

// ── claim readiness ─────────────────────────────────────────────────────────

test('box shots with no aspects read UNCLASSIFIED, never missing', () => {
  // This is the whole dogfood reality today: 0 of 3405 rows carry an aspect.
  // Three red crosses on a carton with good photos is the failure to avoid.
  const m = buildCartonPhotoTriage([pkg(), unboxCarton(), itemShot()]);
  assert.equal(m.aspectsUnwritten, true);
  assert.equal(m.readiness.find((r) => r.key === 'shipping_label')?.state, 'unclassified');
  assert.equal(m.readiness.find((r) => r.key === 'box_exterior')?.state, 'unclassified');
  // The item line IS answerable — it is an entity question, not an aspect one.
  assert.equal(m.readiness.find((r) => r.key === 'item')?.state, 'present');
});

test('no box shots at all is genuinely MISSING, not unclassified', () => {
  const m = buildCartonPhotoTriage([itemShot()]);
  assert.equal(m.readiness.find((r) => r.key === 'shipping_label')?.state, 'missing');
  assert.equal(m.readiness.find((r) => r.key === 'box_exterior')?.state, 'missing');
});

test('a classified aspect reads present', () => {
  const m = buildCartonPhotoTriage([
    unboxCarton({ photoAspect: 'shipping_label' }),
    itemShot(),
  ]);
  assert.equal(m.readiness.find((r) => r.key === 'shipping_label')?.state, 'present');
  assert.equal(m.aspectsUnwritten, false);
});

test('once a carton classifies something, the absent aspect becomes MISSING', () => {
  // Classification is demonstrably happening here, so silence about box_exterior
  // is real absence rather than an un-migrated row.
  const m = buildCartonPhotoTriage([
    unboxCarton({ photoAspect: 'shipping_label' }),
    unboxCarton({ id: 4, photoUrl: '/d', photoAspect: 'packing_material' }),
  ]);
  assert.equal(m.readiness.find((r) => r.key === 'box_exterior')?.state, 'missing');
});

test('an unknown aspect string is dropped, never bucketed as the nearest thing', () => {
  const m = buildCartonPhotoTriage([unboxCarton({ photoAspect: 'shipping-label' })]);
  assert.equal(m.all[0]?.aspect, null);
  assert.equal(m.readiness.find((r) => r.key === 'shipping_label')?.state, 'unclassified');
});

test('item readiness ignores aspects entirely', () => {
  const m = buildCartonPhotoTriage([pkg(), itemShot({ photoAspect: null })]);
  assert.equal(m.readiness.find((r) => r.key === 'item')?.state, 'present');
});

// ── selection ───────────────────────────────────────────────────────────────

test('cartonPhotoBucketRows routes each drill selection', () => {
  const m = buildCartonPhotoTriage([pkg({ hasClaimEvidence: true }), itemShot()]);
  assert.equal(cartonPhotoBucketRows(m, null).length, 2);
  assert.equal(cartonPhotoBucketRows(m, 'box').length, 1);
  assert.equal(cartonPhotoBucketRows(m, 'item').length, 1);
  assert.equal(cartonPhotoBucketRows(m, 'claim').length, 1);
});
