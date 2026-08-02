import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sqlCartonStagePhotoCount,
  sqlLineIdsPhotoCount,
  sqlLinePhotoCount,
  sqlPoLevelPhotoCount,
  sqlReceivingPhotoCount,
  SQL_SELECT_RECEIVING_PHOTO_COUNT,
} from '@/lib/photos/queries/receiving-list';

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'receiving-list.ts'),
  'utf8',
);

test('sqlReceivingPhotoCount counts via photo_entity_links only', () => {
  const sql = sqlReceivingPhotoCount('rl.receiving_id', 'rl.organization_id');
  assert.match(sql, /photo_entity_links/);
  assert.match(sql, /RECEIVING_LINE/);
  assert.match(sql, /rl\.receiving_id/);
  assert.doesNotMatch(sql, /p\.entity_type/);
});

test('SQL_SELECT_RECEIVING_PHOTO_COUNT casts receivingId param as int', () => {
  assert.match(SQL_SELECT_RECEIVING_PHOTO_COUNT, /\$2::int/);
});

test('sqlPoLevelPhotoCount counts RECEIVING entity only', () => {
  const sql = sqlPoLevelPhotoCount('r.id', 'r.organization_id');
  assert.match(sql, /entity_type = 'RECEIVING'/);
  assert.doesNotMatch(sql, /RECEIVING_LINE/);
});

test('sqlLinePhotoCount counts a single receiving line', () => {
  const sql = sqlLinePhotoCount('rl.id', 'rl.organization_id');
  assert.match(sql, /RECEIVING_LINE/);
  assert.match(sql, /rl\.id/);
});

test('sqlLineIdsPhotoCount accepts int array param', () => {
  const sql = sqlLineIdsPhotoCount('$2::int[]', 'rl.organization_id');
  assert.match(sql, /\$2::int\[\]/);
});

test('sqlCartonStagePhotoCount package pins entity + package types and excludes receiving_item', () => {
  const sql = sqlCartonStagePhotoCount('$2::int', '$1', 'package');
  // Entity AND type come from the intent fragment — never entity-only.
  assert.match(sql, /l\.entity_type = 'RECEIVING'/);
  assert.match(sql, /COALESCE\(p\.photo_type, ''\) IN \('receiving_package', 'receiving', ''\)/);
  assert.match(sql, /\$2::int/);
  // Mis-stamped item-on-carton rows must never count as arrival evidence.
  assert.doesNotMatch(sql, /receiving_item/);
  assert.doesNotMatch(sql, /receiving_unbox_carton/);
});

test('sqlCartonStagePhotoCount unbox_carton pins the exact unbox type', () => {
  const sql = sqlCartonStagePhotoCount('$2::int', '$1', 'unbox_carton');
  assert.match(sql, /l\.entity_type = 'RECEIVING'/);
  assert.match(sql, /p\.photo_type = 'receiving_unbox_carton'/);
  assert.doesNotMatch(sql, /'receiving_package'/);
});

// ── list SELECT shape ───────────────────────────────────────────────────────
// `listReceivingPhotos` needs a live pool, so these read the module source.
// What they defend is a mapping that cannot be checked by types alone.

test('secondary link roles resolve via EXISTS, never off the pinned join alias', () => {
  // `l` is INNER JOINed on RECEIVING / RECEIVING_LINE, so `l.link_role` is the
  // constant 'primary' — selecting it would ship a field that looks answered.
  assert.doesNotMatch(SOURCE, /l\.link_role\s+AS/);
  assert.match(SOURCE, /EXISTS \(\s*SELECT 1 FROM photo_entity_links cl/);
  assert.match(SOURCE, /EXISTS \(\s*SELECT 1 FROM photo_entity_links il/);
  // Both EXISTS must stay org-scoped — photo_entity_links is tenant data.
  assert.match(SOURCE, /cl\.organization_id = p\.organization_id/);
  assert.match(SOURCE, /il\.organization_id = p\.organization_id/);
});

test('link-role literals are bound, not interpolated, and typed against the SoT', () => {
  assert.match(SOURCE, /const CLAIM_EVIDENCE_ROLE: PhotoLinkRole = 'claim_evidence'/);
  assert.match(SOURCE, /const INSURANCE_SHARE_ROLE: PhotoLinkRole = 'insurance_share'/);
  assert.match(SOURCE, /cl\.link_role = \$2/);
  assert.match(SOURCE, /il\.link_role = \$3/);
  // $2/$3 are reserved for the roles, so callers must start pushing at $4.
  assert.match(
    SOURCE,
    /const params: unknown\[\] = \[input\.organizationId, CLAIM_EVIDENCE_ROLE, INSURANCE_SHARE_ROLE\]/,
  );
});

test('photoType ships beside caption — the alias is not renamed', () => {
  // Renaming it breaks the receive gate (`photo-policy.ts`) and four other
  // readers that parse `caption` AS the stage. Additive only.
  assert.match(SOURCE, /p\.photo_type AS caption/);
  assert.match(SOURCE, /photoType: row\.caption/);
});
