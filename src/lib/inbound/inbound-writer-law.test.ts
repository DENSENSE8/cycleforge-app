/**
 * Source laws for inbound identity (operator 2026-09-27):
 *   1. a receiving_line is born only by the known writers — the one inbound
 *      writer (ingest-purchase via ingestInboundOrder), the Zoho connector, and
 *      the physical door paths (a line added to a carton in hand);
 *   2. the set of files that name a Zoho item id only shrinks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import baseline from './zoho-identity-baseline.json';

const REPO = path.resolve(__dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = walk(path.join(REPO, 'src')).map((full) => ({
  rel: path.relative(REPO, full),
  text: readFileSync(full, 'utf8'),
}));

const RECEIVING_LINE_BIRTH_WRITERS = [
  'src/lib/inbound/ingest-purchase.ts',
  'src/lib/zoho-receiving-sync.ts',
  'src/app/api/receiving-lines/route.ts',
  'src/app/api/receiving/add-unmatched-line/route.ts',
  'src/app/api/receiving/lookup-po/route.ts',
  'src/app/api/zoho/purchase-orders/receive/route.ts',
];

test('only the known writers insert a receiving_line (orders land through ingestInboundOrder)', () => {
  const births = SOURCES.filter((f) => /INSERT INTO receiving_line\b(?!_)/.test(f.text)).map((f) => f.rel).sort();
  assert.deepEqual(
    births.filter((f) => !RECEIVING_LINE_BIRTH_WRITERS.includes(f)),
    [],
    'a new receiving_line writer — land orders through ingestInboundOrder (src/lib/inbound/ingest-inbound-order.ts)',
  );
});

test('the Zoho item id never spreads to a new file; files that stopped naming it leave the baseline', () => {
  const allowed = new Set(baseline.files);
  const naming = SOURCES.filter((f) => /zoho_item_id|zohoItemId/.test(f.text) && !f.rel.includes('/migrations/') && f.rel !== 'src/lib/drizzle/schema.ts')
    .map((f) => f.rel);
  assert.deepEqual(
    naming.filter((f) => !allowed.has(f)).sort(),
    [],
    'key the item on sku_catalog.id; read an external id through catalog_external_ids',
  );
  const named = new Set(naming);
  assert.deepEqual(
    baseline.files.filter((f) => !named.has(f)),
    [],
    'these files no longer name a Zoho item id — remove them from zoho-identity-baseline.json',
  );
});
