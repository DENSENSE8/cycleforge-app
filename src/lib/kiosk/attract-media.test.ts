/**
 * Unit tests for kiosk attract media helpers.
 * Run: `node --import tsx --test src/lib/kiosk/attract-media.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTRACT_ALLOWED_MIME,
  ATTRACT_BLOB_CACHE_MAX_AGE_SEC,
  ATTRACT_IMAGE_MAX_BYTES,
  ATTRACT_VIDEO_MAX_BYTES,
  attractBlobKey,
  attractMediaMaxBytes,
  isAttractVideoMime,
  isOrgAttractBlobUrl,
  sanitizeAttractFileName,
} from './attract-media';

test('allowlist covers image + video MIME used by AttractLoop', () => {
  assert.ok(ATTRACT_ALLOWED_MIME.has('image/jpeg'));
  assert.ok(ATTRACT_ALLOWED_MIME.has('image/png'));
  assert.ok(ATTRACT_ALLOWED_MIME.has('image/webp'));
  assert.ok(ATTRACT_ALLOWED_MIME.has('image/gif'));
  assert.ok(ATTRACT_ALLOWED_MIME.has('video/mp4'));
  assert.ok(ATTRACT_ALLOWED_MIME.has('video/webm'));
  assert.equal(ATTRACT_ALLOWED_MIME.has('application/pdf'), false);
  assert.equal(ATTRACT_ALLOWED_MIME.has('image/svg+xml'), false);
});

test('size ceilings: 8MB images, 50MB video', () => {
  assert.equal(attractMediaMaxBytes('image/jpeg'), ATTRACT_IMAGE_MAX_BYTES);
  assert.equal(attractMediaMaxBytes('video/mp4'), ATTRACT_VIDEO_MAX_BYTES);
  assert.ok(isAttractVideoMime('video/webm'));
  assert.equal(isAttractVideoMime('image/png'), false);
});

test('attract blob cache is one year (unique timestamped keys)', () => {
  assert.equal(ATTRACT_BLOB_CACHE_MAX_AGE_SEC, 60 * 60 * 24 * 365);
});

test('blob key is org-scoped under kiosk-attract', () => {
  const key = attractBlobKey('org-uuid', 'welcome.mp4');
  assert.match(key, /^orgs\/org-uuid\/kiosk-attract\/\d+_welcome\.mp4$/);
});

test('sanitize strips path separators and spaces', () => {
  assert.equal(sanitizeAttractFileName('../../hi there.png'), '.._.._hi_there.png');
  assert.equal(sanitizeAttractFileName('welcome shot!.mp4'), 'welcome_shot.mp4');
});

test('isOrgAttractBlobUrl only matches this org attract prefix', () => {
  const orgId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  assert.equal(
    isOrgAttractBlobUrl(
      `https://abc.public.blob.vercel-storage.com/orgs/${orgId}/kiosk-attract/1_x.mp4`,
      orgId,
    ),
    true,
  );
  assert.equal(
    isOrgAttractBlobUrl(
      `https://abc.public.blob.vercel-storage.com/orgs/other/kiosk-attract/1_x.mp4`,
      orgId,
    ),
    false,
  );
  assert.equal(
    isOrgAttractBlobUrl('https://cdn.example.com/screensaver.jpg', orgId),
    false,
  );
});
