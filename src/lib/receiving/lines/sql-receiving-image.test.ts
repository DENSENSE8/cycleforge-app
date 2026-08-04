/**
 * Pin the receiving-line thumb SQL fragment: Zoho document-id proxy first,
 * never a wrong Ecwid catalog thumb when a Zoho item row exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RECEIVING_LINE_IMAGE_URL_SQL } from './sql-receiving-image';
import { buildReceivingLinesByReceivingIdSql } from './build-sql';

test('RECEIVING_LINE_IMAGE_URL_SQL prefers Zoho proxy over sc.image_url', () => {
  assert.match(
    RECEIVING_LINE_IMAGE_URL_SQL,
    /\/api\/zoho\/items\/' \|\| i\.zoho_item_id \|\| '\/image/,
  );
  assert.match(RECEIVING_LINE_IMAGE_URL_SQL, /image_document_id/);
  assert.match(RECEIVING_LINE_IMAGE_URL_SQL, /ELSE sc\.image_url/);
  // Catalog fallback only in the no-Zoho-item branch — EXISTS gate must be present.
  assert.match(RECEIVING_LINE_IMAGE_URL_SQL, /EXISTS\s*\(\s*SELECT 1 FROM items i/s);
});

test('siblings SQL (?receiving_id=) emits the Zoho image proxy CASE', () => {
  const { lines } = buildReceivingLinesByReceivingIdSql(
    42,
    '00000000-0000-0000-0000-000000000001',
  );
  assert.match(lines.sql, /\/api\/zoho\/items\/' \|\| i\.zoho_item_id \|\| '\/image/);
  assert.doesNotMatch(
    lines.sql,
    /^\s*sc\.image_url,\s*$/m,
    'bare sc.image_url select must not remain (alias is via RECEIVING_LINE_IMAGE_URL_SQL)',
  );
});
