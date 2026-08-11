/**
 * Guard: kiosk attract media uploads go through the dedicated Blob route and
 * brand.attractMediaUrl — never the photos platform (auth-gated content URLs
 * break AttractLoop on the kiosk host).
 *
 * Run: `node --import tsx --test src/lib/kiosk/attract-media.test.ts \
 *        src/components/settings/sections/kiosk-attract-media.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CARD = readFileSync(
  join(process.cwd(), 'src/components/settings/sections/KioskAttractMediaCard.tsx'),
  'utf8',
);
const ROUTE = readFileSync(
  join(process.cwd(), 'src/app/api/admin/organization/attract-media/route.ts'),
  'utf8',
);
const ORG_SECTION = readFileSync(
  join(process.cwd(), 'src/components/settings/sections/OrganizationSection.tsx'),
  'utf8',
);

test('Settings card posts to attract-media, not photos upload', () => {
  assert.match(CARD, /\/api\/admin\/organization\/attract-media/);
  assert.doesNotMatch(CARD, /\/api\/photos\/upload/);
  assert.doesNotMatch(CARD, /uploadPhoto/);
});

test('Organization Branding mounts KioskAttractMediaCard', () => {
  assert.match(ORG_SECTION, /KioskAttractMediaCard/);
  assert.doesNotMatch(
    ORG_SECTION,
    /Kiosk attract media URL/,
    'URL-only paste field must be replaced by the upload card',
  );
});

test('attract-media route uses public Blob put + brand settings', () => {
  assert.match(ROUTE, /from '@vercel\/blob'/);
  assert.match(ROUTE, /access:\s*'public'/);
  assert.match(ROUTE, /updateOrgSettings/);
  assert.match(ROUTE, /attractMediaUrl/);
  assert.match(ROUTE, /permission:\s*'admin\.view'/);
  assert.doesNotMatch(ROUTE, /uploadPhoto|from '@\/lib\/photos/);
});
