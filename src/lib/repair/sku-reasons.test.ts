/**
 * Per-SKU repair reason rules — DB-free, via injected deps.
 * What these defend (operator 2026-09-14, the kiosk Add-reason CTA):
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  addSkuReason,
  listSkuReasons,
  mergeReasonLabel,
  visibleReasonBase,
  isMissingRelationError,
  SKU_REASON_SORT_ORDER,
  type SkuReasonDeps,
} from './sku-reasons';
import { REPAIR_FAILURE_LABELS } from './repair-failure-reasons';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const OTHER_ORG = '00000000-0000-0000-0000-000000000002' as OrgId;

type Call = { fn: string; args: unknown[] };

function fakes(opts: {
  favoriteId?: number | null;
  rows?: Array<{ label: string; favorite_sku_id: number | null }>;
} = {}) {
  const calls: Call[] = [];
  let nextAnchorId = 77;
  const deps: SkuReasonDeps = {
    findFavoriteSkuId: async (sku, orgId) => {
      calls.push({ fn: 'findFavoriteSkuId', args: [sku, orgId] });
      return opts.favoriteId ?? null;
    },
    ensureFavoriteSkuId: async (input, orgId) => {
      calls.push({ fn: 'ensureFavoriteSkuId', args: [input, orgId] });
      return opts.favoriteId ?? nextAnchorId++;
    },
    listIssues: async (favoriteSkuId, orgId) => {
      calls.push({ fn: 'listIssues', args: [favoriteSkuId, orgId] });
      return opts.rows ?? [];
    },
    createIssue: async (input, orgId) => {
      calls.push({ fn: 'createIssue', args: [input, orgId] });
      return { label: input.label, favorite_sku_id: input.favoriteSkuId };
    },
  };
  return { deps, calls };
}

test('addSkuReason scopes the new reason to the SKU that is already favorited', async () => {
  const { deps, calls } = fakes({ favoriteId: 42 });

  const result = await addSkuReason(ORG, { sku: 'ABC-RS', label: '  No power  ' }, deps);

  assert.deepEqual(result, { ok: true, row: { label: 'No power', favoriteSkuId: 42 } });
  const created = calls.find((c) => c.fn === 'createIssue');
  // A SKU-scoped row, never `favoriteSkuId: null` — a tablet cannot add a
  // reason to every repair on the floor.
  assert.deepEqual(created?.args[0], {
    favoriteSkuId: 42,
    label: 'No power',
    sortOrder: SKU_REASON_SORT_ORDER,
  });
});

test('addSkuReason anchors an unfavorited catalog SKU instead of writing a global reason', async () => {
  const { deps, calls } = fakes({ favoriteId: null });

  const result = await addSkuReason(
    ORG,
    { sku: 'NEW-SKU-RS', label: 'Tray stuck', productLabel: 'CD tray repair' },
    deps,
  );

  assert.equal(result.ok, true);
  const ensured = calls.find((c) => c.fn === 'ensureFavoriteSkuId');
  assert.deepEqual(ensured?.args[0], { sku: 'NEW-SKU-RS', label: 'CD tray repair' });
  const created = calls.find((c) => c.fn === 'createIssue');
  assert.deepEqual(created?.args[0], {
    favoriteSkuId: 77,
    label: 'Tray stuck',
    sortOrder: SKU_REASON_SORT_ORDER,
  });
});

test('addSkuReason writes nothing when the SKU already has that reason', async () => {
  const { deps, calls } = fakes({
    favoriteId: 42,
    rows: [
      { label: 'No sound', favorite_sku_id: null },
      { label: 'Tray Stuck', favorite_sku_id: 42 },
    ],
  });

  // Same label, different case — two people at the counter, one row.
  const dupSku = await addSkuReason(ORG, { sku: 'ABC-RS', label: 'tray stuck' }, deps);
  assert.deepEqual(dupSku, { ok: true, row: { label: 'Tray Stuck', favoriteSkuId: 42 } });

  // Already a global reason: still no per-SKU copy of it.
  const dupGlobal = await addSkuReason(ORG, { sku: 'ABC-RS', label: 'No sound' }, deps);
  assert.deepEqual(dupGlobal, { ok: true, row: { label: 'No sound', favoriteSkuId: null } });

  assert.equal(calls.some((c) => c.fn === 'createIssue'), false);
});

test('addSkuReason refuses a blank label or a missing SKU without writing anything', async () => {
  const blank = fakes();
  assert.deepEqual(await addSkuReason(ORG, { sku: 'ABC-RS', label: '   ' }, blank.deps), {
    ok: false,
    error: 'LABEL_REQUIRED',
  });
  assert.equal(blank.calls.length, 0);

  const noSku = fakes();
  assert.deepEqual(await addSkuReason(ORG, { sku: null, label: 'No power' }, noSku.deps), {
    ok: false,
    error: 'SKU_REQUIRED',
  });
  assert.equal(noSku.calls.length, 0);
});

test('every DB call carries the caller org — two orgs never share a lookup', async () => {
  const mine = fakes({ favoriteId: 5 });
  await addSkuReason(ORG, { sku: 'ABC-RS', label: 'No sound' }, mine.deps);
  await listSkuReasons(ORG, 'ABC-RS', mine.deps);
  for (const call of mine.calls) {
    assert.equal(call.args[call.args.length - 1], ORG, `${call.fn} lost the org`);
  }

  const theirs = fakes({ favoriteId: 5 });
  await listSkuReasons(OTHER_ORG, 'ABC-RS', theirs.deps);
  for (const call of theirs.calls) {
    assert.equal(call.args[call.args.length - 1], OTHER_ORG);
  }
});

test('listSkuReasons returns globals plus the SKU rows, and globals only without a SKU', async () => {
  const withSku = fakes({
    favoriteId: 9,
    rows: [
      { label: 'No sound', favorite_sku_id: null },
      { label: 'Tray stuck', favorite_sku_id: 9 },
    ],
  });
  const scoped = await listSkuReasons(ORG, 'ABC-RS', withSku.deps);
  assert.equal(scoped.favoriteSkuId, 9);
  assert.deepEqual(scoped.rows.map((r) => r.label), ['No sound', 'Tray stuck']);
  assert.deepEqual(withSku.calls.find((c) => c.fn === 'listIssues')?.args[0], 9);

  const noSku = fakes({ rows: [{ label: 'No sound', favorite_sku_id: null }] });
  const global = await listSkuReasons(ORG, '   ', noSku.deps);
  assert.equal(global.favoriteSkuId, null);
  // A blank SKU never costs a favorite lookup.
  assert.equal(noSku.calls.some((c) => c.fn === 'findFavoriteSkuId'), false);
  assert.deepEqual(global.rows, [{ label: 'No sound', favoriteSkuId: null }]);
});

test('mergeReasonLabel appends without dropping or duplicating what is showing', () => {
  const visible = ['No sound', 'CD Issues'];

  assert.deepEqual(mergeReasonLabel(visible, '  Tray stuck '), [
    'No sound',
    'CD Issues',
    'Tray stuck',
  ]);
  // Case-insensitive dedupe — the list stays as-is, nothing is reordered.
  assert.deepEqual(mergeReasonLabel(visible, 'no SOUND'), visible);
  assert.deepEqual(mergeReasonLabel(visible, '   '), visible);
  // Never shrinks.
  assert.equal(mergeReasonLabel(visible, 'Tray stuck').length >= visible.length, true);
});

test('visibleReasonBase keeps the built-in reasons on screen when the DB has none', () => {
  assert.deepEqual(visibleReasonBase([]), REPAIR_FAILURE_LABELS);
  assert.deepEqual(visibleReasonBase(['Only one']), ['Only one']);
  // The add path extends the fallback rather than replacing it, so adding the
  // first reason for a SKU cannot make the other reasons vanish.
  const merged = mergeReasonLabel(visibleReasonBase([]), 'Tray stuck');
  assert.equal(merged.length, REPAIR_FAILURE_LABELS.length + 1);
  assert.equal(merged[merged.length - 1], 'Tray stuck');
});

test('isMissingRelationError only matches an unmigrated table', () => {
  assert.equal(isMissingRelationError(Object.assign(new Error('nope'), { code: '42P01' })), true);
  assert.equal(isMissingRelationError(Object.assign(new Error('dup'), { code: '23505' })), false);
  assert.equal(isMissingRelationError(new Error('plain')), false);
  assert.equal(isMissingRelationError(null), false);
});
