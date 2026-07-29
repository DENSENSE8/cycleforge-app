import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sqlCartonStagePhotoCount,
  sqlLineIdsPhotoCount,
  sqlLinePhotoCount,
  sqlPoLevelPhotoCount,
  sqlReceivingPhotoCount,
  SQL_SELECT_RECEIVING_PHOTO_COUNT,
} from '@/lib/photos/queries/receiving-list';

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
