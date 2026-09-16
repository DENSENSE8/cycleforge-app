/**
 * Per-SKU allocations — the REUSE guard.
 *
 * This desk's whole contribution is a layout document and a definition id, and
 * every assertion here exists to keep it that way. A second allocations
 * catalog would pass a shape check and be a second vocabulary for one entity
 * (`unit-allocations.ts`: *"What it must not do is mint `sku-allocations.order`
 * beside `unit-allocations.order`"*), so the tests below pin identity — the
 * same objects, not copies that will drift — rather than deep equality.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNIT_ALLOCATIONS_FIELD_CATALOG } from './unit-allocations';
import * as skuAllocationsLayout from './sku-allocations-layout';
import {
  SKU_ALLOCATIONS_PRODUCT_LAYOUT,
  SKU_ALLOCATIONS_TABLE_LAYOUT_ID,
} from './sku-allocations-layout';
import { parseSlotLayout } from '../slot-layout';
import {
  SKU_ALLOCATIONS_COMPOUND_COLUMNS,
  SKU_ALLOCATIONS_TABLE_BINDING,
  SKU_ALLOCATIONS_TABLE_DEFINITION,
} from '@/components/inventory/sku-allocations-grid/sku-allocations-table-definition';
import {
  UNIT_ALLOCATIONS_TABLE_BINDING,
  UNIT_ALLOCATIONS_TABLE_DEFINITION,
} from '@/components/inventory/allocations-grid/unit-allocations-table-definition';

describe('sku-allocations layout document', () => {
  it('binds only unit-allocations facts — no second vocabulary, and no ALIAS of one', () => {
    const bound = [
      SKU_ALLOCATIONS_PRODUCT_LAYOUT.identityFieldId,
      ...SKU_ALLOCATIONS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...SKU_ALLOCATIONS_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ];
    const known = new Set(UNIT_ALLOCATIONS_FIELD_CATALOG.map((f) => f.id));
    for (const fieldId of bound) {
      assert.ok(
        fieldId.startsWith('unit-allocations.'),
        `${fieldId} mints a second id for a shared fact`,
      );
      assert.ok(known.has(fieldId), `${fieldId} is not a fact of the shared catalog`);
    }
    // The module holds a layout DOCUMENT and nothing else. A re-export of the
    // catalog under a second name is a second SoT by another route — the
    // `catalog-orphan` finding (integration ruling 2026-09-12).
    const exported = Object.keys(skuAllocationsLayout).sort();
    assert.deepEqual(exported, [
      'SKU_ALLOCATIONS_PRODUCT_LAYOUT',
      'SKU_ALLOCATIONS_TABLE_LAYOUT_ID',
    ]);
  });

  it('parses against that catalog, and paints the five retired per-SKU cells', () => {
    const parsed = parseSlotLayout(SKU_ALLOCATIONS_PRODUCT_LAYOUT, UNIT_ALLOCATIONS_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    // Order → identity chip, unit → item title, state → pill, allocated →
    // Dates chrome (all four from the shared adapter + materializer)…
    assert.equal(parsed.identityFieldId, 'unit-allocations.order');
    // …and "By", the one fact the retired per-SKU table painted that the unit
    // desk never selected.
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['unit-allocations.allocated_by'],
    );
    assert.deepEqual(parsed.subtitleBindings, []);
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('does NOT bind the release facts — this feed filters released rows out', () => {
    const bound = [
      SKU_ALLOCATIONS_PRODUCT_LAYOUT.identityFieldId,
      ...SKU_ALLOCATIONS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...SKU_ALLOCATIONS_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ];
    // `a.state <> 'RELEASED'` + every writer setting `released_at` in the same
    // statement as `state = 'RELEASED'` ⇒ both columns are structurally NULL
    // here, so binding them would paint two permanently dashed tracks.
    assert.ok(!bound.includes('unit-allocations.released'));
    assert.ok(!bound.includes('unit-allocations.reason'));
    // They stay FACTS an org can bind if it ever widens the feed.
    for (const id of ['unit-allocations.released', 'unit-allocations.reason']) {
      const field = UNIT_ALLOCATIONS_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });

  it('is its own prefs bucket, and its own definition', () => {
    assert.equal(SKU_ALLOCATIONS_TABLE_LAYOUT_ID, 'sku-allocations');
    assert.equal(SKU_ALLOCATIONS_TABLE_DEFINITION.tableId, 'sku-allocations');
    assert.notEqual(
      SKU_ALLOCATIONS_TABLE_DEFINITION.tableId,
      UNIT_ALLOCATIONS_TABLE_DEFINITION.tableId,
      'two bindings sharing one tableId fail the record-plane guard',
    );
    assert.notEqual(SKU_ALLOCATIONS_TABLE_DEFINITION.id, UNIT_ALLOCATIONS_TABLE_DEFINITION.id);
    // ONE entity, though: same family, same cell map.
    assert.equal(SKU_ALLOCATIONS_TABLE_DEFINITION.entityFamily, 'unit-allocations');
    assert.equal(SKU_ALLOCATIONS_TABLE_DEFINITION.cellMapKey, 'unit-allocations');
  });

  it('materializes the shared skeleton with this document\'s one track', () => {
    const slots = SKU_ALLOCATIONS_COMPOUND_COLUMNS.filter((c) =>
      String(c.key).startsWith('status:'),
    );
    assert.deepEqual(
      slots.map((c) => [c.key, c.fieldId]),
      [['status:1', 'unit-allocations.allocated_by']],
    );
    // The shared materializer's relabels come along unchanged — this desk did
    // not fork a column model to get them.
    const label = (key: string) =>
      SKU_ALLOCATIONS_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'Unit');
    assert.equal(label('dates'), 'Allocated');
    assert.equal(label('state'), 'State');
  });

  it('declares the unit reach-through the retired cell linked to', () => {
    // The record plane is the ONE thing that genuinely differs per desk, and
    // the reason this mount needs a definition of its own at all: the unit
    // desk's rows are orders with no route to open, these rows are units with
    // one.
    assert.equal(SKU_ALLOCATIONS_TABLE_BINDING.recordPlane.kind, 'navigate');
    assert.equal(UNIT_ALLOCATIONS_TABLE_BINDING.recordPlane.kind, 'none');
    assert.equal(SKU_ALLOCATIONS_TABLE_DEFINITION.capabilities.inCellEdit, false);
    assert.equal(SKU_ALLOCATIONS_TABLE_DEFINITION.ariaLabel, 'Open allocations');
  });
});
