import assert from 'node:assert/strict';
import test from 'node:test';

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
