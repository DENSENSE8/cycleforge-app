/**
 * Guard — the definition↔columns **DRIFT CHECK**, which this repo has cited as
 * house law and never enforced.
 *
 * `registered-bindings.ts` documents the exact regression at length: there were
 * once two hand-maintained lists of "all the tables", and when `inventory.units`
 * and `outbound.csv-import-staging` were registered the guard's copy was not
 * updated, so **two surfaces silently escaped the drift check for the whole of
 * their life**. That file's fix was to derive both directions from one list.
 * This file is the other half — the check itself, which a repo-wide search for
 * `*.guard.test.ts` showed did not exist at all
 * (`docs/todo/seller-table-program-PLAN.md` §14, wave 1.5).
 *
 * ## What drift costs
 *
 * `TableSurfaceBinding.columns` is the family's TYPED model — what the row
 * renderer and the descriptor consume. `definition.columns` is the authored,
 * Zod-validated half — what the header draws and what an org layout is
 * validated against. They are two declarations of one shape, and the whole
 * binding waist assumes they agree: `binding.columns` says "Must describe the
 * same columns as `definition.columns` — pinned by the registry guard."
 *
 * When they disagree the failure is silent and visual: a header over a column
 * that renders nothing, or a rendered column with no header, on one desk.
 *
 * Derived from `REGISTERED_BINDINGS` rather than a hand-typed list, because a
 * hand-typed list is precisely what failed last time.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from './compound/compound-columns';
import { SLOT_LAYOUT_TABLES } from '@/lib/tables/org-table-layouts';
import { REGISTERED_BINDINGS } from './registered-bindings';
import { TABLE_DEFINITIONS, tableDefinitionIds } from './table-definition-registry';

describe('table definition registry — definition↔columns drift', () => {
  it('has bindings to check at all', () => {
    // A guard that silently checks nothing is the failure mode this whole file
    // exists to end.
    assert.ok(REGISTERED_BINDINGS.length > 0);
  });

  for (const binding of REGISTERED_BINDINGS) {
    const id = binding.definition.id;

    it(`${id}: the typed columns and the definition's columns are the same keys, in order`, () => {
      assert.deepEqual(
        binding.columns.map((c) => c.key),
        binding.definition.columns.map((c) => c.key),
        `${id}: binding.columns and definition.columns have drifted`,
      );
    });

    it(`${id}: every column agrees on width and frozen-ness across both halves`, () => {
      // Width and `frozen` are the two fields the sticky-offset math reads from
      // one half and the CSS grid template from the other — a disagreement here
      // pins the frozen pane at the wrong origin, which is the failure the
      // compound `thumb` cell already suffered once.
      const byKey = new Map(binding.definition.columns.map((c) => [c.key, c]));
      for (const col of binding.columns) {
        const authored = byKey.get(col.key);
        assert.ok(authored, `${id}: ${col.key} is missing from the definition`);
        assert.equal(col.width, authored.width, `${id}: ${col.key} width drifted`);
        assert.equal(
          col.frozen === true,
          authored.frozen === true,
          `${id}: ${col.key} frozen flag drifted`,
        );
      }
    });
  }
});

describe('table definition registry — enumeration', () => {
  it('every registered binding is reachable by its id, and ids are unique', () => {
    const ids = REGISTERED_BINDINGS.map((b) => b.definition.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate definition ids');
    for (const id of ids) {
      assert.ok(TABLE_DEFINITIONS[id], `${id} is not reachable through the registry`);
    }
  });

  it('the enumeration and the registry describe the same set', () => {
    assert.deepEqual(
      tableDefinitionIds(),
      [...REGISTERED_BINDINGS.map((b) => b.definition.id)].sort(),
    );
  });
});

/**
 * The check the drift guard above **cannot** make, and the one that would have
 * caught wave 1.3's real regression.
 *
 * Drift compares `binding.columns` against `definition.columns`. For all six
 * compound families those were the SAME reference — a hand array — so the guard
 * passed while the three station desks, Home, Tasks and both Review queues each
 * mounted the slot materialization instead. The canonical model was a second
 * source of truth that no assertion could see, because the assertion was
 * comparing a thing to itself.
 *
 * The consequence was not cosmetic. Each family's sort vocabulary was derived
 * from that flat array (`DAILY_GRID_SORTABLE_KEYS = DAILY_GRID_COLUMNS.filter…`),
 * so `useUrlColumnSort`'s `isColumn` rejected every mounted track key and
 * **clicking a column header did nothing on six desks**. `queue-display-sort`
 * documents the identical bug on To-Ship, one wave earlier.
 *
 * So: a family that has opted into slot layouts and paints the COMPOUND morph
 * must declare compound tracks as its canonical columns. The compound skeleton
 * is one shared declaration (`COMPOUND_COLUMN_KEYS`), which makes this checkable
 * without knowing anything family-specific — a hand array fails on its very
 * first data key.
 */
describe('slot-opted compound families declare the compound model', () => {
  const COMPOUND_KEYS = new Set<string>(COMPOUND_COLUMN_KEYS);
  const isSlotBand = (key: string) => /^(status|subtitle):\d+$/.test(key);

  const compoundBindings = REGISTERED_BINDINGS.filter((binding) => {
    const entry = SLOT_LAYOUT_TABLES[binding.definition.tableId];
    return entry?.morphs.length === 1 && entry.morphs[0] === 'compound';
  });

  it('finds the compound families to check', () => {
    assert.ok(
      compoundBindings.length >= 6,
      `expected the wave 1.3 families, found ${compoundBindings.length}`,
    );
  });

  for (const binding of compoundBindings) {
    const id = binding.definition.id;

    it(`${id}: canonical columns are compound tracks, not a hand array`, () => {
      const stray = binding.columns
        .map((c) => c.key)
        .filter((key) => !COMPOUND_KEYS.has(key) && !isSlotBand(key));

      assert.deepEqual(
        stray,
        [],
        `${id} declares ${stray.join(', ')} — flat hand-model keys. Its desks ` +
          'mount the compound materialization, so this is a second source of ' +
          'truth: the sort vocabulary, the Fields menu and the drift check ' +
          'above all read a model nothing paints. Point the definition at the ' +
          "family's *_COMPOUND_COLUMNS.",
      );
    });

    it(`${id}: definition and binding agree on that model`, () => {
      assert.deepEqual(
        binding.definition.columns.map((c) => c.key),
        binding.columns.map((c) => c.key),
      );
    });
  }
});
