/** Tech bench catalog guards + resolver behaviour — Wave C's first family, and the Packer bench's sibling. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS, COMPOUND_TRACKS } from '@/components/tables/compound/compound-columns';
import type { DeskPickRecord } from '@/hooks/useDeskPickLogs';
import { techRecordToQueueRow } from '@/lib/station/record-to-queue-row';
import { materializeTracks } from '../materialize-tracks';

import { PACKER_FIELD_CATALOG } from './packer';
import { TECH_FIELD_CATALOG, TECH_PRODUCT_LAYOUT, TECH_TABLE_LAYOUT_ID } from './tech';
import { resolveTechSlotValue, techSlotValuesFor } from './tech-resolve';

function techRecord(overrides: Partial<DeskPickRecord> = {}): DeskPickRecord {
  return {
    id: 4411,
    created_at: '2026-09-08T17:04:00.000Z',
    shipping_tracking_number: '1Z999AA10123456784',
    serial_number: 'SN-88213',
    tested_by: 7,
    order_id: '19-13337-42001',
    product_title: 'Bose Wave IV',
    quantity: '2',
    condition: 'USED_GOOD',
    sku: 'BOSE-WAVE-IV',
    item_number: '285512340091',
    notes: 'Left channel crackles under load',
    ...overrides,
  };
}

/** The bench row the grid actually paints — mapper output, never a hand shape. */
function row(overrides: Partial<DeskPickRecord> = {}) {
  return techRecordToQueueRow(techRecord(overrides));
}

/** The mounted compound model for a layout, skeleton derived from the engine. */
function columnsFor(layout = TECH_PRODUCT_LAYOUT) {
  return materializeTracks({ layout, catalog: TECH_FIELD_CATALOG, base: COMPOUND_TRACKS });
}

describe('tech catalog', () => {
  it('has unique ids, all tech-family, each bindable somewhere', () => {
    const ids = TECH_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of TECH_FIELD_CATALOG) {
      assert.equal(field.family, 'tech', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('tech.'), `${field.id} is not family-qualified`);
    }
  });

  it('shares NO field id with packer, though the two benches look alike', () => {
    const packer = new Set(PACKER_FIELD_CATALOG.map((f) => f.id));
    for (const field of TECH_FIELD_CATALOG) {
      assert.ok(!packer.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('every stage_event field carries an iconKey and one-word verb faces', () => {
    for (const field of TECH_FIELD_CATALOG) {
      if (field.displayType !== 'stage_event') continue;
      assert.ok(field.iconKey, `${field.id} has no iconKey`);
      assert.ok(field.stageLabels, `${field.id} has no verb faces`);
      assert.ok(!field.stageLabels!.done.includes(' '));
      assert.ok(!field.stageLabels!.pending.includes(' '));
    }
  });

  it('names none of the chrome facts the flat bench array painted', () => {
    const ids = new Set(TECH_FIELD_CATALOG.map((f) => f.id));
    // title = the item cell's first line; age/Late = the Dates chrome;
    // stage = the state pill. urgent + packStation have NO path on a mapped row.
    for (const ghost of ['tech.title', 'tech.age', 'tech.stage', 'tech.urgent', 'tech.pack_station']) {
      assert.ok(!ids.has(ghost), `${ghost} must not be a bindable fact`);
    }
  });

  it('product default parses against the catalog — the test step, no money', () => {
    const parsed = TECH_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'tech.order_id');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['tech.tested'],
    );
    assert.equal(parsed.amountFieldId, null);
  });

  it('the identity fact is the ORDER, and it carries the tracking second line', () => {
    const identity = TECH_FIELD_CATALOG.find((f) => f.id === TECH_PRODUCT_LAYOUT.identityFieldId);
    assert.ok(identity);
    assert.equal(identity.displayType, 'id');
    assert.deepEqual(identity.paths, {
      orderId: 'order_id',
      tracking: 'shipping_tracking_number',
    });
  });

  it('serves the `tech` tableId', () => {
    assert.equal(TECH_TABLE_LAYOUT_ID, 'tech');
  });
});

describe('the mounted tech compound model', () => {
  it('opens the status band straight after the state pill, skeleton unforked', () => {
    const keys = columnsFor().map((c) => c.key);
    // `COMPOUND_COLUMN_KEYS` is the SoT for the surrounding order — hand-listing
    // the skeleton forked and went stale twice already.
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 2), ['state', 'status:1']);
  });

  it('binds exactly one track — the three flat tester columns collapsed into it', () => {
    const bound = columnsFor().filter((c) => c.fieldId);
    assert.deepEqual(
      bound.map((c) => [c.key, c.fieldId, c.slotDisplayType]),
      [['status:1', 'tech.tested', 'stage_event']],
    );
  });
});

describe('resolveTechSlotValue', () => {
  it('resolves the test step off a mapped bench row', () => {
    const value = resolveTechSlotValue(row(), 'tech.tested');
    assert.ok(value && value.kind === 'stage_event');
    // The tech mapper projects no name alias, so the actor IS the staff id —
    // the cell draws an avatar from it. Never an invented `Staff #7` label.
    assert.equal(value.whoStaffId, 7);
    assert.equal(value.who, null);
    assert.ok(value.at, 'the test stamp must resolve');
    assert.equal(value.station, null);
  });

  it('resolves each remaining catalog field off the mapped row', () => {
    const r = row();
    assert.deepEqual(resolveTechSlotValue(r, 'tech.order_id'), {
      kind: 'value',
      text: '19-13337-42001',
    });
    assert.deepEqual(resolveTechSlotValue(r, 'tech.qty'), { kind: 'value', text: '2' });
    assert.deepEqual(resolveTechSlotValue(r, 'tech.serial'), { kind: 'value', text: 'SN-88213' });
    assert.deepEqual(resolveTechSlotValue(r, 'tech.sku'), { kind: 'value', text: 'BOSE-WAVE-IV' });
    assert.deepEqual(resolveTechSlotValue(r, 'tech.item_number'), {
      kind: 'value',
      text: '285512340091',
    });
    assert.deepEqual(resolveTechSlotValue(r, 'tech.notes'), {
      kind: 'value',
      text: 'Left channel crackles under load',
    });
    const condition = resolveTechSlotValue(r, 'tech.condition');
    assert.ok(condition && condition.kind === 'value' && condition.text);
  });

  it('honest absence: an unclaimed scan resolves no actor, a bare row no facts', () => {
    const bare = row({ tested_by: 0, serial_number: '', sku: null, notes: '', condition: null });
    const step = resolveTechSlotValue(bare, 'tech.tested');
    assert.ok(step && step.kind === 'stage_event');
    assert.equal(step.whoStaffId, null);
    assert.deepEqual(resolveTechSlotValue(bare, 'tech.serial'), { kind: 'value', text: null });
    assert.deepEqual(resolveTechSlotValue(bare, 'tech.sku'), { kind: 'value', text: null });
    assert.deepEqual(resolveTechSlotValue(bare, 'tech.notes'), { kind: 'value', text: null });
    assert.deepEqual(resolveTechSlotValue(bare, 'tech.condition'), { kind: 'value', text: null });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveTechSlotValue(row(), 'tech.ghost'), null);
    // A sibling family's id is just as unknown — catalogs do not bleed.
    assert.equal(resolveTechSlotValue(row(), 'packer.packed'), null);
  });
});

describe('techSlotValuesFor', () => {
  it('keys resolved values by TRACK key, so a rebind re-points the cell', () => {
    const columns = columnsFor({
      ...TECH_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'tech.serial' }],
    });
    assert.deepEqual(techSlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: 'SN-88213' },
    });
  });

  it('an unbound skeleton resolves no slots at all', () => {
    const columns = columnsFor({ ...TECH_PRODUCT_LAYOUT, statusBindings: [] });
    assert.equal(techSlotValuesFor(row(), columns), undefined);
  });
});
