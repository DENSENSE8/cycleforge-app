/**
 * The staff identity cache is the ONE resolution point for a staffer's face:
 * `<StaffAvatar>` reads it by staff id so timelines, journeys and schedule
 * pills need no photo join. These pin the two behaviours that are easy to
 * break — the avatar surviving a colour refill, and the single-staffer patch
 * NOT flattening everyone else's warm colour.
 *
 * Run: node --test --import tsx src/utils/staff-identity-cache.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getStaffAvatarPhotoId,
  getStaffColorHex,
  setStaffAvatarPhotoId,
  setStaffColorCache,
  setStaffColorHex,
} from './staff-colors';

test('a /api/staff refill carries colour AND avatar per staffer', () => {
  setStaffColorCache([
    { id: 1, color_hex: '#a855f7', avatar_photo_id: 42 },
    { id: 2, color_hex: '#3b82f6', avatar_photo_id: null },
  ]);
  assert.equal(getStaffAvatarPhotoId(1), 42);
  assert.equal(getStaffColorHex({ id: 1 }), '#a855f7');
  // No photo is the common case and must be null, never a guessed id.
  assert.equal(getStaffAvatarPhotoId(2), null);
  // An unknown staffer resolves to no photo, not to someone else's.
  assert.equal(getStaffAvatarPhotoId(999), null);
  assert.equal(getStaffAvatarPhotoId(null), null);
});

test('a staffer with a photo but no assigned colour keeps the photo', () => {
  setStaffColorCache([{ id: 3, color_hex: null, avatar_photo_id: 7 }]);
  assert.equal(getStaffAvatarPhotoId(3), 7);
});

test('the single-staffer patch leaves every other staffer intact', () => {
  // This is why the upload path patches instead of calling setStaffColorCache:
  // a full replace would drop every colleague's warm colour until the next
  // /api/staff fetch lands.
  setStaffColorCache([
    { id: 1, color_hex: '#a855f7', avatar_photo_id: 42 },
    { id: 2, color_hex: '#3b82f6', avatar_photo_id: 11 },
  ]);

  setStaffAvatarPhotoId(1, 99);
  assert.equal(getStaffAvatarPhotoId(1), 99);
  assert.equal(getStaffAvatarPhotoId(2), 11);
  assert.equal(getStaffColorHex({ id: 2 }), '#3b82f6');

  // Clearing is null, and it clears only the one staffer.
  setStaffAvatarPhotoId(1, null);
  assert.equal(getStaffAvatarPhotoId(1), null);
  assert.equal(getStaffAvatarPhotoId(2), 11);
  assert.equal(getStaffColorHex({ id: 1 }), '#a855f7');
});

test('the single-staffer colour patch leaves every other staffer intact', () => {
  setStaffColorCache([
    { id: 1, color_hex: '#a855f7', avatar_photo_id: 42 },
    { id: 2, color_hex: '#3b82f6', avatar_photo_id: 11 },
  ]);
  setStaffColorHex(1, '#ef4444');
  assert.equal(getStaffColorHex({ id: 1 }), '#ef4444');
  assert.equal(getStaffColorHex({ id: 2 }), '#3b82f6');
  assert.equal(getStaffAvatarPhotoId(1), 42);
});

test('a non-positive photo id is treated as absent, not as an id', () => {
  setStaffColorCache([{ id: 4, color_hex: '#10b981', avatar_photo_id: 0 }]);
  assert.equal(getStaffAvatarPhotoId(4), null);
  setStaffAvatarPhotoId(4, 0);
  assert.equal(getStaffAvatarPhotoId(4), null);
});
