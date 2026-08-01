import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PACKED_SAVED_VIEWS_KEY,
  SHIPPED_SAVED_VIEWS_KEY,
  UNSHIPPED_SAVED_VIEWS_KEY,
} from '@/components/unshipped/outbound-sidebar-shared';
import { SAVED_VIEW_STORAGE_KEY } from '@/lib/station/table-url-params';
import {
  GENERIC_SAVED_VIEW_SURFACES,
  SAVED_VIEW_SURFACES,
  isGenericSavedViewSurface,
  isSavedViewSurface,
  surfaceFromStorageKey,
} from './surfaces';

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
  assert.equal(SAVED_VIEW_SURFACES.length, 10);
});

/**
 * The TS list and the DB CHECK are two halves of one discriminator. The
 * inclusion test above passes if a surface is added to only one of them — and
 * the failure mode is invisible until the first insert on the new surface is
 * rejected by `saved_views_surface_chk` in production. Compare the sets.
 */
test('SAVED_VIEW_SURFACES matches the saved_views_surface_chk CHECK exactly', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('../migrations/2026-07-29g_saved_views.sql', import.meta.url)),
    'utf8',
  );
  const chk = /saved_views_surface_chk[\s\S]*?CHECK\s*\(\s*surface\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(sql);
  assert.ok(chk, 'could not find the saved_views_surface_chk CHECK in the birth migration');

  const inCheck = [...chk[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.ok(inCheck.length > 0, 'parsed an empty CHECK value list');

  assert.deepEqual(
    [...SAVED_VIEW_SURFACES].sort(),
    inCheck,
    'SAVED_VIEW_SURFACES and the DB CHECK disagree — a surface in only one place fails on first insert. Add it to BOTH (new values need a follow-up migration redefining the CHECK).',
  );
});

test('GENERIC_SAVED_VIEW_SURFACES excludes operations and media_library', () => {
  assert.ok(!GENERIC_SAVED_VIEW_SURFACES.includes('operations' as never));
  assert.ok(!GENERIC_SAVED_VIEW_SURFACES.includes('media_library' as never));
  assert.equal(GENERIC_SAVED_VIEW_SURFACES.length, 8);
  for (const s of GENERIC_SAVED_VIEW_SURFACES) {
    assert.ok(isSavedViewSurface(s));
    assert.ok(isGenericSavedViewSurface(s));
  }
});

test('surfaceFromStorageKey maps outbound + station keys', () => {
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
