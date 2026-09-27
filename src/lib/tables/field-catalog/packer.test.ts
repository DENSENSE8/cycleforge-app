/** Packer bench catalog guards + resolver behaviour — Wave C's second family. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS, COMPOUND_TRACKS } from '@/components/tables/compound/compound-columns';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import { packerRecordToQueueRow } from '@/lib/station/record-to-queue-row';
import { materializeTracks } from '../materialize-tracks';
import { parseSlotLayout } from '../slot-layout';
import {
  PACKER_FIELD_CATALOG,
  PACKER_PRODUCT_LAYOUT,
  PACKER_TABLE_LAYOUT_ID,
} from './packer';
import { packerSlotValuesFor, resolvePackerSlotValue } from './packer-resolve';
import { TECH_FIELD_CATALOG } from './tech';

function packerRecord(): PackerRecord {
  return {
    id: 9902,
    created_at: '2026-09-08T19:41:00.000Z',
    scan_ref: 'SN-88213',
    shipping_tracking_number: '1Z999AA10123456784',
    packed_by: 12,
    packed_by_name: 'Dana Ruiz',
    tracking_type: 'UPS',
    order_id: '19-13337-42001',
    product_title: 'Bose Wave IV',
    quantity: '2',
    item_number: '285512340091',
    condition: 'USED_GOOD',
    serial_number: 'SN-88213',
    sku: 'BOSE-WAVE-IV',
    notes: 'Double-boxed, fragile',
    tested_by: 7,
    tested_by_name: 'Alex Chen',
    test_date_time: '2026-09-08T17:04:00.000Z',
    packer_photos_url: [],
  } as PackerRecord;
}

/** The bench row the grid actually paints — mapper output, never a hand shape. */
function row(overrides: Partial<PackerRecord> = {}) {
  return packerRecordToQueueRow({ ...packerRecord(), ...overrides });
}

/** The mounted compound model for a layout, skeleton derived from the engine. */
function columnsFor(layout = PACKER_PRODUCT_LAYOUT) {
  return materializeTracks({ layout, catalog: PACKER_FIELD_CATALOG, base: COMPOUND_TRACKS });
}

describe('packer catalog', () => {
  it('has unique ids, all packer-family, each bindable somewhere', () => {
    const ids = PACKER_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of PACKER_FIELD_CATALOG) {
      assert.equal(field.family, 'packer', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('packer.'), `${field.id} is not family-qualified`);
    }
  });

  it('shares NO field id with tech, though the two benches look alike', () => {
    const tech = new Set(TECH_FIELD_CATALOG.map((f) => f.id));
    for (const field of PACKER_FIELD_CATALOG) {
      assert.ok(!tech.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('every stage_event field carries an iconKey and one-word verb faces', () => {
    for (const field of PACKER_FIELD_CATALOG) {
      if (field.displayType !== 'stage_event') continue;
      assert.ok(field.iconKey, `${field.id} has no iconKey`);
      assert.ok(field.stageLabels, `${field.id} has no verb faces`);
      assert.ok(!field.stageLabels!.done.includes(' '));
      assert.ok(!field.stageLabels!.pending.includes(' '));
    }
  });

  it('names none of the chrome facts the flat bench array painted', () => {
    const ids = new Set(PACKER_FIELD_CATALOG.map((f) => f.id));
    for (const ghost of [
      'packer.title',
      'packer.age',
      'packer.stage',
      'packer.urgent',
      'packer.pack_station',
    ]) {
      assert.ok(!ids.has(ghost), `${ghost} must not be a bindable fact`);
    }
  });

  it('neither stage event claims a station — the mapper projects no bench label', () => {
    for (const field of PACKER_FIELD_CATALOG) {
      if (field.displayType !== 'stage_event') continue;
      assert.ok(!field.paths?.station, `${field.id} names a station path that does not exist`);
    }
  });

  it('product default parses — BOTH stamps, tester first, no money', () => {
    const parsed = parseSlotLayout(PACKER_PRODUCT_LAYOUT, PACKER_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'packer.order_id');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['packer.tested', 'packer.packed'],
    );
    assert.equal(parsed.amountFieldId, null);
  });

  it('the identity fact is the ORDER, and it carries the tracking second line', () => {
    const identity = PACKER_FIELD_CATALOG.find(
      (f) => f.id === PACKER_PRODUCT_LAYOUT.identityFieldId,
    );
    assert.ok(identity);
    assert.equal(identity.displayType, 'id');
    assert.deepEqual(identity.paths, {
      orderId: 'order_id',
      tracking: 'shipping_tracking_number',
    });
  });

  it('serves the `packer` tableId', () => {
    assert.equal(PACKER_TABLE_LAYOUT_ID, 'packer');
  });
});

describe('the mounted packer compound model', () => {
  it('opens the status band straight after the state pill, skeleton unforked', () => {
    const keys = columnsFor().map((c) => c.key);
    // `COMPOUND_COLUMN_KEYS` is the SoT for the surrounding order — hand-listing
    // the skeleton forked and went stale twice already.
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 3), ['state', 'status:1', 'status:2']);
  });

  it('binds the two stage tracks the flat array spent five columns on', () => {
    const bound = columnsFor().filter((c) => c.fieldId);
    assert.deepEqual(
      bound.map((c) => [c.key, c.fieldId, c.slotDisplayType]),
      [
        ['status:1', 'packer.tested', 'stage_event'],
        ['status:2', 'packer.packed', 'stage_event'],
      ],
    );
  });
});

describe('resolvePackerSlotValue', () => {
  it('resolves the pack step off a mapped bench row', () => {
    const value = resolvePackerSlotValue(row(), 'packer.packed');
    assert.ok(value && value.kind === 'stage_event');
    assert.equal(value.who, 'Dana Ruiz');
    assert.equal(value.whoStaffId, 12);
    assert.ok(value.at, 'the pack stamp must resolve');
    assert.equal(value.station, null);
  });

  it('resolves the UPSTREAM test step the same row carries', () => {
    const value = resolvePackerSlotValue(row(), 'packer.tested');
    assert.ok(value && value.kind === 'stage_event');
    assert.equal(value.who, 'Alex Chen');
    assert.equal(value.whoStaffId, 7);
    assert.ok(value.at, 'the test stamp must resolve');
  });

  it('resolves each remaining catalog field off the mapped row', () => {
    const r = row();
    assert.deepEqual(resolvePackerSlotValue(r, 'packer.order_id'), {
      kind: 'value',
      text: '19-13337-42001',
    });
    assert.deepEqual(resolvePackerSlotValue(r, 'packer.qty'), { kind: 'value', text: '2' });
    assert.deepEqual(resolvePackerSlotValue(r, 'packer.serial'), {
      kind: 'value',
      text: 'SN-88213',
    });
    assert.deepEqual(resolvePackerSlotValue(r, 'packer.sku'), {
      kind: 'value',
      text: 'BOSE-WAVE-IV',
    });
    assert.deepEqual(resolvePackerSlotValue(r, 'packer.item_number'), {
      kind: 'value',
      text: '285512340091',
    });
    assert.deepEqual(resolvePackerSlotValue(r, 'packer.notes'), {
      kind: 'value',
      text: 'Double-boxed, fragile',
    });
    const condition = resolvePackerSlotValue(r, 'packer.condition');
    assert.ok(condition && condition.kind === 'value' && condition.text);
  });

  it('honest absence: a row with no upstream test resolves no tester, not a guess', () => {
    const untested = row({ tested_by: 0, tested_by_name: null, test_date_time: null });
    const step = resolvePackerSlotValue(untested, 'packer.tested');
    assert.ok(step && step.kind === 'stage_event');
    assert.equal(step.who, null);
    assert.equal(step.whoStaffId, null);
    assert.equal(step.at, null);
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolvePackerSlotValue(row(), 'packer.ghost'), null);
    // A sibling family's id is just as unknown — catalogs do not bleed.
    assert.equal(resolvePackerSlotValue(row(), 'tech.tested'), null);
  });
});

describe('packerSlotValuesFor', () => {
  it('keys resolved values by TRACK key, so a rebind re-points the cell', () => {
    const columns = columnsFor({
      ...PACKER_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'packer.serial' }],
    });
    assert.deepEqual(packerSlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: 'SN-88213' },
    });
  });

  it('an unbound skeleton resolves no slots at all', () => {
    const columns = columnsFor({ ...PACKER_PRODUCT_LAYOUT, statusBindings: [] });
    assert.equal(packerSlotValuesFor(row(), columns), undefined);
  });
});
