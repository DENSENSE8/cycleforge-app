/**
 * Table definition registry — the authored half and the typed half must
 * describe the same grid.
 *
 * Plan: `docs/todo/nonlinear-data-table-engine-PLAN.md` (Phase 1).
 *
 * A definition is pure data and a binding is code, which is the whole point —
 * but it also means nothing in the type system stops the two from drifting: a
 * column added to `RECEIVING_GRID_COLUMNS` and forgotten in the definition
 * would compile, render (the mount passes `binding.columns`), and leave the
 * definition quietly describing a grid that no longer exists. Since Phase 2
 * has Studio authoring against the definition, a stale definition is a Studio
 * that edits a fiction. Hence the deep-equality assertions below.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import {
  RECEIVING_GRID_CAPABILITIES,
  makeReceivingGridDescriptor,
} from '@/components/station/receiving-grid/receiving-grid-descriptor';
import {
  RECEIVING_BROWSE_DEFINITION,
  RECEIVING_TABLE_BINDING,
} from '@/components/station/receiving-grid/receiving-table-definition';
import {
  MAX_DEFAULT_VISIBLE_TRACKS,
  defaultVisibleTrackKeys,
  tableDefinitionSchema,
} from '@/lib/tables/table-definition';
import {
  TABLE_DEFINITIONS,
  getTableDefinition,
  tableDefinitionIds,
} from './table-definition-registry';
import { REGISTERED_BINDINGS } from './registered-bindings';

describe('table definition registry', () => {
  it('every registered definition still satisfies the schema', () => {
    // Definitions parse at module load, so this is belt-and-braces for the one
    // case that skips it: a definition object mutated after construction.
    for (const definition of Object.values(TABLE_DEFINITIONS)) {
      assert.doesNotThrow(
        () => tableDefinitionSchema.parse(definition),
        `${definition.id} no longer parses`,
      );
    }
  });

  it('ids are unique and registry lookup resolves them', () => {
    const ids = tableDefinitionIds();
    assert.deepEqual(ids, [...new Set(ids)], 'duplicate definition ids');
    for (const id of ids) {
      assert.equal(getTableDefinition(id)?.id, id);
    }
    assert.equal(getTableDefinition('nope.missing'), undefined, 'unknown id must not resolve');
  });

  it('every binding is registered under its own definition id', () => {
    for (const binding of REGISTERED_BINDINGS) {
      assert.equal(
        getTableDefinition(binding.definition.id),
        binding.definition,
        `${binding.definition.id} binding is not the registered definition`,
      );
    }
  });

  it('the authored columns match the typed column model', () => {
    for (const binding of REGISTERED_BINDINGS) {
      assert.deepEqual(
        binding.definition.columns,
        binding.columns,
        `${binding.definition.id}: definition.columns has drifted from the typed model`,
      );
    }
  });

  it('the authored capabilities match the descriptor the family builds', () => {
    for (const binding of REGISTERED_BINDINGS) {
      assert.deepEqual(
        binding.makeDescriptor(binding.columns).capabilities,
        binding.definition.capabilities,
        `${binding.definition.id}: definition capabilities differ from the descriptor's`,
      );
      // The descriptor id IS the definition id — this registry is that string's
      // first reader after it spent Phase C being write-only.
      assert.equal(binding.makeDescriptor(binding.columns).id, binding.definition.id);
    }
  });

  it('every definition opens lean enough for a dense bench', () => {
    for (const definition of Object.values(TABLE_DEFINITIONS)) {
      const visible = defaultVisibleTrackKeys(definition.columns);
      assert.ok(
        visible.length <= MAX_DEFAULT_VISIBLE_TRACKS,
        `${definition.id} opens with ${visible.length} tracks: ${visible.join(', ')}`,
      );
    }
  });
});

describe('receiving.browse — the golden definition', () => {
  it('re-declares nothing: it is a validated SNAPSHOT of the family SoT', () => {
    // Not reference-equal, and that is the schema doing its job: `.parse()`
    // returns a clone, so the definition is a snapshot of the column model
    // rather than an alias of it. That is correct for the authored half — a
    // definition has to survive `JSON.parse` — but it means drift between the
    // two is silent, which is exactly why the registry deep-equality tests
    // above exist and why they are not redundant with this one.
    assert.notEqual(RECEIVING_BROWSE_DEFINITION.columns, RECEIVING_GRID_COLUMNS);
    assert.deepEqual(RECEIVING_BROWSE_DEFINITION.columns, RECEIVING_GRID_COLUMNS);
    assert.deepEqual(RECEIVING_BROWSE_DEFINITION.capabilities, RECEIVING_GRID_CAPABILITIES);

    // The typed half, by contrast, IS the SoT by reference — the mount hands
    // `binding.columns` to the engine, and `makeDescriptor` must be the stable
    // module-level ref the surface memoizes on.
    assert.equal(RECEIVING_TABLE_BINDING.columns, RECEIVING_GRID_COLUMNS);
    assert.equal(RECEIVING_TABLE_BINDING.makeDescriptor, makeReceivingGridDescriptor);
  });

  it('carries the identity the mount used to hard-code', () => {
    assert.equal(RECEIVING_BROWSE_DEFINITION.id, 'receiving.browse');
    assert.equal(RECEIVING_BROWSE_DEFINITION.tableId, 'receiving');
    assert.equal(RECEIVING_BROWSE_DEFINITION.entityFamily, 'receiving');
    assert.equal(RECEIVING_BROWSE_DEFINITION.surface, 'sheet');
    assert.equal(RECEIVING_BROWSE_DEFINITION.ariaLabel, 'Receiving carton lines');
    assert.equal(RECEIVING_BROWSE_DEFINITION.testId, 'receiving-grid-body');
    // Date is a per-row column on this family; Testing History overrides.
    assert.equal(RECEIVING_BROWSE_DEFINITION.showDayHeaders, false);
  });

  it('keeps the frozen identity pane and the optional tier it shipped with', () => {
    const frozen = RECEIVING_BROWSE_DEFINITION.columns.filter((c) => c.frozen).map((c) => c.key);
    assert.deepEqual(frozen, ['select', 'order'], 'frozen pane is select · order');

    const optional = RECEIVING_BROWSE_DEFINITION.columns
      .filter((c) => c.tier === 'optional')
      .map((c) => c.key);
    assert.deepEqual(optional, ['condition', 'serial', 'zoho']);

    assert.deepEqual(defaultVisibleTrackKeys(RECEIVING_BROWSE_DEFINITION.columns), [
      'order',
      'title',
      'status',
      'date',
      'qty',
      'price',
      'location',
      'tracking',
      '_fill',
    ]);
  });
});
