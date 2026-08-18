import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Exact-arm searchers must include serial_units so classic header Find and
 * hybrid bypass surface unit serials without entity_search_docs freshness.
 */

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, 'src/lib/search/global-entity-search.ts'), 'utf8');

test('searchSerialUnits queries serial_units and maps entityType unit', () => {
  assert.match(src, /async function searchSerialUnits/);
  assert.match(src, /FROM serial_units/);
  assert.match(src, /normalized_serial/);
  assert.match(src, /entityType:\s*'unit'/);
  assert.match(src, /searchHitHref\(\s*'SERIAL_UNIT'/);
});

test('searchAllEntities fans out to searchSerialUnits', () => {
  assert.match(src, /searchSerialUnits\(orgId,\s*query,\s*perEntity\)/);
  assert.match(src, /Math\.ceil\(limit\s*\/\s*6\)/);
});
