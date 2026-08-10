/**
 * Golden-first law for the table-import capability.
 *
 * Building the SEAM once is not a fan-out — **mounting** it per family is
 * (`source-of-truth.md` → Table engine fan-out; `pattern-evolution.md` → Never).
 * `TABLE_IMPORT_LIVE_SURFACES` is the shrink-only gate: a family only appears
 * once its staging binding, its host and its commit path land in the SAME
 * change, so an allowlist entry is never a claim the product cannot honour.
 *
 * Today's golden is `orders-import` (To-Ship), proven end to end on the QA org
 * by `tests/e2e/csv-import-staging.spec.ts`. The next family is Unbox History
 * (`ReceivingGridHost`) — not several queues in one pass.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  TABLE_IMPORT_LIVE_SURFACES,
  isTableImportLive,
} from '@/lib/tables/import/registry';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Every mount of the staging mechanism, so a new one cannot arrive unnoticed. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      sourceFiles(rel, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|guard\.test)\.tsx?$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

describe('table import fan-out (golden first)', () => {
  it('the live-surface allowlist is the ONE gate, and it is small', () => {
    // Shrink-only in spirit: growing it is a deliberate, reviewed line. If this
    // number changes, the change must also add that family's host + commit.
    assert.deepEqual([...TABLE_IMPORT_LIVE_SURFACES], ['orders-import']);
    assert.equal(isTableImportLive('orders-import'), true);
    assert.equal(isTableImportLive('receiving-import'), false);
  });

  it('the golden descriptor id matches its table definition entityFamily', () => {
    const definition = read(
      'src/components/outbound/orders/import-staging/csv-import-staging-table-definition.ts',
    );
    // One id for the store key, the prefs bucket and the allowlist — a drift
    // here would stage rows into a draft the desk never reads.
    assert.match(definition, /entityFamily: 'orders-import'/);
    assert.equal(ORDER_IMPORT_DESCRIPTOR.surfaceId, 'orders-import');
    assert.ok(isTableImportLive(ORDER_IMPORT_DESCRIPTOR.surfaceId));
  });

  it('the entry control refuses a family that is not live', () => {
    const control = read('src/components/tables/import/TableImportFileButton.tsx');
    assert.match(control, /isTableImportLive\(descriptor\.surfaceId\)/);
    assert.match(control, /return null/);
  });

  it('every descriptor in the tree is either live or has no entry point', () => {
    const descriptors = sourceFiles('src')
      .filter((f) => /-import-descriptor\.ts$/.test(f))
      .map((f) => ({ file: f, source: read(f) }));

    assert.ok(descriptors.length > 0, 'the orders descriptor must be discoverable');

    for (const { file, source } of descriptors) {
      const id = source.match(/surfaceId:\s*([A-Z_]+|'[a-z-]+')/)?.[1] ?? '';
      assert.ok(id, `${file} must declare a surfaceId`);
    }
  });

  it('the seam owns the ONE csv reader — families do not re-parse', () => {
    const store = read('src/lib/tables/import/staging-store.ts');
    assert.match(store, /from '@\/lib\/tables\/import\/parse-csv'/);
    // The orders vocabulary re-exports the reader for existing callers but must
    // not carry a second implementation of it.
    const orders = read('src/lib/orders/csv-order-import.ts');
    assert.match(orders, /export \{ parseCsv \} from '@\/lib\/tables\/import\/parse-csv'/);
    assert.doesNotMatch(orders, /function parseCsv/);
  });
});
