/**
 * Tripwire — every SLOT_TABLE_SESSION_LAWS id has a matching grep.
 *
 * Run: node --import tsx --test src/lib/tables/slot-table-session-laws.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import {
  INCOMING_COMPOUND_COLUMNS,
  RECEIVING_COMPOUND_COLUMNS,
} from '@/lib/receiving/receiving-grid-layout';
import { isLineMoneyFieldId } from '@/lib/tables/slot-table-line-money';
import { SLOT_TABLE_SESSION_LAWS } from './slot-table-session-laws';

const ROOT = process.cwd();

function read(rel: string): string {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `missing ${rel}`);
  return readFileSync(abs, 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('slot-table session laws (operator rulings as greps)', () => {
  it('every law has a unique id and an eval hook', () => {
    const ids = SLOT_TABLE_SESSION_LAWS.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length >= 12, 'session law catalog must not shrink below the 2026-09-05 pin');
    for (const law of SLOT_TABLE_SESSION_LAWS) {
      assert.ok(law.mustMatch || law.mustNotMatch, `${law.id} needs a grep`);
      assert.ok(['slot-table', 'shortcuts', 'station'].includes(law.eval), law.id);
    }
  });

  for (const law of SLOT_TABLE_SESSION_LAWS) {
    it(`${law.id}`, () => {
      const src = law.codeOnly ? code(read(law.file)) : read(law.file);
      if (law.mustMatch) {
        assert.match(src, new RegExp(law.mustMatch), `${law.file} missing ${law.id}: ${law.ruling}`);
      }
      if (law.mustNotMatch) {
        assert.doesNotMatch(
          src,
          new RegExp(law.mustNotMatch),
          `${law.file} violates ${law.id}: ${law.ruling}`,
        );
      }
    });
  }

  it('engine.inbound-shares-skeleton — Incoming and Receiving keys match COMPOUND_COLUMN_KEYS', () => {
    const skeleton = [...COMPOUND_COLUMN_KEYS];
    assert.deepEqual(
      INCOMING_COMPOUND_COLUMNS.map((c) => c.key),
      skeleton,
      'Incoming must mount the shared skeleton — Orders is not a different table',
    );
    assert.deepEqual(
      RECEIVING_COMPOUND_COLUMNS.map((c) => c.key),
      skeleton,
      'Receiving must mount the shared skeleton — do not fork an inbound Amount column',
    );
  });

  it('occupancy and last-cost are not line money', () => {
    assert.equal(isLineMoneyFieldId('catalog.cost'), false);
    assert.equal(isLineMoneyFieldId('sku-velocity.stock'), false);
    assert.equal(isLineMoneyFieldId('dead-stock.stock'), false);
    assert.equal(isLineMoneyFieldId('bins.total_qty'), false);
    assert.equal(isLineMoneyFieldId('incoming.price'), true);
    assert.equal(isLineMoneyFieldId('receiving.price'), true);
    assert.equal(isLineMoneyFieldId('orders.amount'), true);
  });
});
