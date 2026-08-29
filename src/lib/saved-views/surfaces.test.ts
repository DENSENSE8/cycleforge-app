import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PACKED_SAVED_VIEWS_KEY,
  SHIPPED_SAVED_VIEWS_KEY,
  UNSHIPPED_SAVED_VIEWS_KEY,
} from '@/components/unshipped/outbound-sidebar-shared';
import { SAVED_VIEW_STORAGE_KEY } from '@/lib/station/table-url-params';
import { MY_DAY_SAVED_VIEWS_KEY } from '@/lib/my-day/my-day-saved-views';
import {
  GENERIC_SAVED_VIEW_SURFACES,
  SAVED_VIEW_SURFACES,
  isGenericSavedViewSurface,
  isSavedViewSurface,
  surfaceFromStorageKey,
} from './surfaces';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

const SURFACE_CHK_RE =
  /saved_views_surface_chk[\s\S]*?CHECK\s*\(\s*surface\s+IN\s*\(([\s\S]*?)\)\s*\)/i;

/**
 * The **effective** CHECK: a constraint is redefined, never appended to, so the
 * live definition is the one in the LAST-SORTING migration that defines it.
 * Reading only the birth migration would fail the moment a follow-up legitimately
 * widened the union — and, worse, would keep passing if a follow-up narrowed it.
 */
function effectiveSurfaceCheck(): { file: string; values: string[] } {
  const hits = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(MIGRATIONS_DIR + file, 'utf8') }))
    .filter(({ sql }) => SURFACE_CHK_RE.test(sql));

  assert.ok(hits.length > 0, 'no migration defines saved_views_surface_chk');
  const last = hits[hits.length - 1];
  const body = SURFACE_CHK_RE.exec(last.sql)![1];
  return { file: last.file, values: [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) };
}

test('SAVED_VIEW_SURFACES includes ops, media, dashboard_*, and *_history', () => {
  assert.ok(SAVED_VIEW_SURFACES.includes('operations'));
  assert.ok(SAVED_VIEW_SURFACES.includes('media_library'));
  assert.ok(SAVED_VIEW_SURFACES.includes('dashboard_unshipped'));
  assert.ok(SAVED_VIEW_SURFACES.includes('dashboard_packed'));
  assert.ok(SAVED_VIEW_SURFACES.includes('dashboard_shipped'));
  assert.ok(SAVED_VIEW_SURFACES.includes('tech_history'));
  assert.ok(SAVED_VIEW_SURFACES.includes('packer_history'));
  assert.ok(SAVED_VIEW_SURFACES.includes('receiving_history'));
  assert.ok(SAVED_VIEW_SURFACES.includes('receiving_incoming'));
  assert.ok(SAVED_VIEW_SURFACES.includes('testing_history'));
  assert.ok(SAVED_VIEW_SURFACES.includes('home_today'));
  // No length assertion. It was `=== 11`, and it went red on 2026-08-29 when
  // twelve legitimate surfaces were admitted — a count pins a snapshot, and the
  // thing it was standing in for is already tested twice below: the set is
  // compared to the effective DB CHECK, and no historical value may be dropped.
  // What a count CAN still catch that those cannot is a duplicate, which would
  // make one surface silently shadow another in the storage-key map.
  assert.equal(
    new Set(SAVED_VIEW_SURFACES).size,
    SAVED_VIEW_SURFACES.length,
    'a duplicate surface would shadow itself in STORAGE_KEY_TO_SURFACE',
  );
});

/**
 * The TS list and the DB CHECK are two halves of one discriminator. The
 * inclusion test above passes if a surface is added to only one of them — and
 * the failure mode is invisible until the first insert on the new surface is
 * rejected by `saved_views_surface_chk` in production. Compare the sets.
 */
test('SAVED_VIEW_SURFACES matches the saved_views_surface_chk CHECK exactly', () => {
  const { file, values } = effectiveSurfaceCheck();
  assert.ok(values.length > 0, `parsed an empty CHECK value list from ${file}`);

  assert.deepEqual(
    [...SAVED_VIEW_SURFACES].sort(),
    [...values].sort(),
    `SAVED_VIEW_SURFACES and the DB CHECK (${file}) disagree — a surface in only one place fails on first insert. Add it to BOTH (new values need a follow-up migration redefining the CHECK).`,
  );
});

/**
 * A follow-up must re-state the WHOLE union, so no value may be silently
 * dropped by a later redefinition. Fold every historical definition together and
 * assert the effective one is a superset — this is the exact regression
 * `.claude/rules/polymorphic-tables.md` records for `reason_codes_flow_context_chk`.
 */
test('the effective CHECK never drops a value an earlier migration admitted', () => {
  const { file, values } = effectiveSurfaceCheck();
  const effective = new Set(values);

  for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(MIGRATIONS_DIR + f, 'utf8');
    const m = SURFACE_CHK_RE.exec(sql);
    if (!m) continue;
    for (const [, value] of m[1].matchAll(/'([a-z_]+)'/g)) {
      assert.ok(
        effective.has(value),
        `${f} admitted surface '${value}' but the effective CHECK (${file}) drops it — ` +
          'redefine the constraint with the full union, never an incremental edit.',
      );
    }
  }
});

test('GENERIC_SAVED_VIEW_SURFACES excludes operations and media_library', () => {
  assert.ok(!GENERIC_SAVED_VIEW_SURFACES.includes('operations' as never));
  assert.ok(!GENERIC_SAVED_VIEW_SURFACES.includes('media_library' as never));
  assert.equal(
    new Set(GENERIC_SAVED_VIEW_SURFACES).size,
    GENERIC_SAVED_VIEW_SURFACES.length,
    'a duplicate generic surface would shadow itself',
  );
  for (const s of GENERIC_SAVED_VIEW_SURFACES) {
    assert.ok(isSavedViewSurface(s));
    assert.ok(isGenericSavedViewSurface(s));
  }
});

test('surfaceFromStorageKey maps Home Today + outbound + station keys', () => {
  assert.equal(surfaceFromStorageKey(MY_DAY_SAVED_VIEWS_KEY), 'home_today');
  assert.equal(surfaceFromStorageKey(UNSHIPPED_SAVED_VIEWS_KEY), 'dashboard_unshipped');
  assert.equal(surfaceFromStorageKey(PACKED_SAVED_VIEWS_KEY), 'dashboard_packed');
  assert.equal(surfaceFromStorageKey(SHIPPED_SAVED_VIEWS_KEY), 'dashboard_shipped');
  assert.equal(surfaceFromStorageKey(SAVED_VIEW_STORAGE_KEY.tech_history), 'tech_history');
  assert.equal(surfaceFromStorageKey(SAVED_VIEW_STORAGE_KEY.packer_history), 'packer_history');
  assert.equal(surfaceFromStorageKey(SAVED_VIEW_STORAGE_KEY.receiving_history), 'receiving_history');
  assert.equal(surfaceFromStorageKey(SAVED_VIEW_STORAGE_KEY.receiving_incoming), 'receiving_incoming');
  assert.equal(surfaceFromStorageKey(SAVED_VIEW_STORAGE_KEY.testing_history), 'testing_history');
});

test('surfaceFromStorageKey returns null for unknown keys', () => {
  assert.equal(surfaceFromStorageKey('not_a_real_key'), null);
  assert.equal(surfaceFromStorageKey(''), null);
});

test('isSavedViewSurface / isGenericSavedViewSurface reject unknowns', () => {
  assert.equal(isSavedViewSurface('dashboard'), false);
  assert.equal(isGenericSavedViewSurface('operations'), false);
  assert.equal(isGenericSavedViewSurface('media_library'), false);
  assert.equal(isSavedViewSurface('operations'), true);
});
