/** Order row flag registry — the vocabulary contract. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  ORDER_ROW_FLAGS,
  ORDER_ROW_FLAG_IDS,
  isOrderRowFlagId,
  resolveOrderRowFlag,
} from './order-row-flags';

const MIGRATION = join(process.cwd(), 'src/lib/migrations/2026-09-17_order_flags_discrepancy.sql');

describe('order row flag registry', () => {
  it('the DDL CHECK and the app registry name the same ids', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const match = sql.match(/order_flags_flag_chk\s*\n?\s*CHECK \(flag IN \(([^)]*)\)\)/);
    assert.ok(match, 'order_flags_flag_chk not found — did the CHECK get renamed?');
    const inDdl = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual(
      [...inDdl].sort(),
      [...ORDER_ROW_FLAG_IDS].sort(),
      'a flag exists in one list but not the other — extend BOTH in the same change',
    );
  });

  it('every id resolves to a complete, distinct presentation', () => {
    const rowClasses = new Set<string>();
    const dotClasses = new Set<string>();
    for (const id of ORDER_ROW_FLAG_IDS) {
      const flag = resolveOrderRowFlag(id);
      assert.ok(flag, `${id} does not resolve`);
      assert.equal(flag.id, id);
      assert.ok(flag.label.trim(), `${id} has no label — colour alone is not a shared vocabulary`);
      assert.ok(flag.hint.trim(), `${id} has no hint — the menu could not teach the set`);
      rowClasses.add(flag.rowClass);
      dotClasses.add(flag.dotClass);
    }
    assert.equal(rowClasses.size, ORDER_ROW_FLAG_IDS.length, 'two flags share a row wash');
    assert.equal(dotClasses.size, ORDER_ROW_FLAG_IDS.length, 'two flags share a dot');
  });

  it('no flag uses blue — blue is selection on this surface', () => {
    // A blue flag would make "I picked this row" and "someone flagged this row"
    // the same colour, on the one surface where both are live at once.
    for (const flag of ORDER_ROW_FLAGS) {
      const paint = `${flag.rowClass} ${flag.dotClass} ${flag.chipClass}`;
      assert.ok(!/\bbg-blue-|text-blue-|ring-blue-/.test(paint), `${flag.id} paints with blue`);
    }
  });

  it('an unknown id renders as UNFLAGGED, never as some other colour', () => {
    // A row written by a newer deploy must degrade to "no tint" — substituting
    // a default would paint a colour the operator never chose.
    for (const bad of ['', 'urgent', 'PRIORITY', null, undefined, 7, {}]) {
      assert.equal(isOrderRowFlagId(bad), false, `${String(bad)} must not be a flag id`);
      assert.equal(resolveOrderRowFlag(bad), null, `${String(bad)} must resolve to null`);
    }
  });

  it('menu order leads with the most-interrupting tag and ends on the all-clear', () => {
    assert.equal(ORDER_ROW_FLAGS[0].id, 'priority');
    assert.equal(ORDER_ROW_FLAGS[ORDER_ROW_FLAGS.length - 1].id, 'ready');
  });
});
