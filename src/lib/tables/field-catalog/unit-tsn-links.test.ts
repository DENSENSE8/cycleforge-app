/**
 * Unit-TSN-links catalog guards + resolver/adapter behaviour — Wave D's port
 * of `ByUnitView.tsx`'s `tech_serial_numbers` table off hand HTML.
 *
 * Fixtures are the WIRE row: `/api/serial-units/<ref>?include=full` returns
 * the SQL row verbatim (snake_case), so a camelCase fixture would test a shape
 * that never reaches the desk.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import type { UnitTsnLinkTableRow } from '@/lib/inventory/tsn-link-row';
import type { TsnLinkRow } from '@/components/inventory/types';
import {
  UNIT_TSN_LINKS_COMPOUND_COLUMNS,
  unitTsnLinksCompoundColumnsFor,
  unitTsnLinksSortFactFor,
  isUnitTsnLinksColumnSortable,
} from '@/components/inventory/tsn-links-grid/unit-tsn-links-grid-layout';
import { unitTsnLinksCompoundView } from '@/components/inventory/tsn-links-grid/unit-tsn-links-row-view';
import {
  UNIT_TSN_LINKS_TABLE_DEFINITION,
  UNIT_TSN_LINKS_TABLE_BINDING,
} from '@/components/inventory/tsn-links-grid/unit-tsn-links-table-definition';
import {
  UNIT_TSN_LINKS_FIELD_CATALOG,
  UNIT_TSN_LINKS_PRODUCT_LAYOUT,
  UNIT_TSN_LINKS_TABLE_LAYOUT_ID,
} from './unit-tsn-links';
import { resolveUnitTsnLinksSlotValue } from './unit-tsn-links-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<UnitTsnLinkTableRow> = {}): UnitTsnLinkTableRow {
  return {
    id: 55123,
    created_at: '2026-03-11T16:42:00.000Z',
    station_source: 'TECH',
    serial_type: 'DEVICE',
    shipment_id: 8804,
    tested_by_name: 'Priya Raman',
    fnsku: 'X001ABCDEF',
    ...overrides,
  };
}

describe('unit-tsn-links catalog', () => {
  it('has unique ids, all unit-tsn-links-family, each bindable somewhere', () => {
    const ids = UNIT_TSN_LINKS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of UNIT_TSN_LINKS_FIELD_CATALOG) {
      assert.equal(field.family, 'unit-tsn-links', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('unit-tsn-links.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the never-painted fact nowhere — `fnsku` stays a non-goal', () => {
    const paths = UNIT_TSN_LINKS_FIELD_CATALOG.flatMap((f) => Object.values(f.paths ?? {}));
    assert.ok(!paths.includes('fnsku'), 'fnsku was never painted — do not restore it');
  });

  it('every catalog path names a real key on the wire row', () => {
    const wire = new Set(Object.keys(row()));
    for (const field of UNIT_TSN_LINKS_FIELD_CATALOG) {
      for (const path of Object.values(field.paths ?? {})) {
        assert.ok(wire.has(path), `${field.id} reads '${path}', which the payload never sends`);
      }
    }
  });

  it('the ByUnitView wire row satisfies the family row type', () => {
    const wire: TsnLinkRow = {
      id: 55123,
      station_source: null,
      shipment_id: null,
      serial_type: 'DEVICE',
      fnsku: null,
      tested_by_name: null,
      created_at: '2026-03-11T16:42:00.000Z',
    };
    const shared: UnitTsnLinkTableRow = wire;
    assert.equal(shared.id, 55123);
  });

  it('product default parses against the catalog — shipment then tester', () => {
    const parsed = parseSlotLayout(UNIT_TSN_LINKS_PRODUCT_LAYOUT, UNIT_TSN_LINKS_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'unit-tsn-links.tsn');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'unit-tsn-links.shipment' },
      { fieldId: 'unit-tsn-links.tested_by' },
    ]);
    assert.deepEqual(parsed.subtitleBindings, []);
  });

  it('the identity fact is the TSN id, and only it may hold the identity slot', () => {
    const identity = UNIT_TSN_LINKS_FIELD_CATALOG.filter((f) => f.slotKinds.includes('identity'));
    assert.deepEqual(identity.map((f) => f.id), ['unit-tsn-links.tsn']);
    // The write gate refuses a non-`id` identity; pin that this one is `id`.
    assert.equal(identity[0].displayType, 'id');
  });

  it('the tester is TEXT, not a person — this feed carries no staff id', () => {
    const field = UNIT_TSN_LINKS_FIELD_CATALOG.find((f) => f.id === 'unit-tsn-links.tested_by');
    assert.equal(field?.displayType, 'text');
  });

  it('serves the `unit-tsn-links` tableId', () => {
    assert.equal(UNIT_TSN_LINKS_TABLE_LAYOUT_ID, 'unit-tsn-links');
    assert.equal(UNIT_TSN_LINKS_TABLE_DEFINITION.tableId, 'unit-tsn-links');
  });

  it('declares no verb and no record plane — a v1 audit row is read-only', () => {
    assert.equal(UNIT_TSN_LINKS_TABLE_DEFINITION.capabilities.inCellEdit, false);
    assert.equal(UNIT_TSN_LINKS_TABLE_DEFINITION.capabilities.multiSelect, false);
    assert.equal(UNIT_TSN_LINKS_TABLE_BINDING.recordPlane.kind, 'none');
    assert.ok(UNIT_TSN_LINKS_TABLE_BINDING.recordPlane.reason, 'absence must carry its reason');
  });
});

describe('the mounted unit-tsn-links compound model', () => {
  it('mounts the shared skeleton WHOLE — no chrome cut, two status tracks', () => {
    const keys = UNIT_TSN_LINKS_COMPOUND_COLUMNS.map((c) => c.key);
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:') && !k.startsWith('subtitle:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 3), ['state', 'status:1', 'status:2']);
  });

  it('renames the chrome headers to this desk’s vocabulary', () => {
    const label = (key: string) =>
      UNIT_TSN_LINKS_COMPOUND_COLUMNS.find((c) => c.key === key)?.gridLabel;
    // The identity header is the ENGINE's `Id` on every peer since
    // 2026-09-15 (`slot-table-id-header-law.ts`); this desk used to print
    // "TSN id", which is now the Fields-picker word and the cell's hover word.
    // Pinned by slot-table-id-header-law.test.ts, not re-pinned here.
    assert.equal(label('fulfillment'), 'Id');
    assert.equal(label('item'), 'Station');
    assert.equal(label('dates'), 'When');
    assert.equal(label('state'), 'Type');
  });

  it('every painted fact is click-to-sort; only chrome is not', () => {
    for (const key of ['fulfillment', 'item', 'state', 'dates', 'status:1', 'status:2']) {
      assert.ok(
        isUnitTsnLinksColumnSortable(UNIT_TSN_LINKS_COMPOUND_COLUMNS, key),
        `${key} paints a fact and must sort`,
      );
    }
    for (const key of ['select', 'thumb', '_fill']) {
      assert.ok(
        !isUnitTsnLinksColumnSortable(UNIT_TSN_LINKS_COMPOUND_COLUMNS, key),
        `${key} is chrome and must not sort`,
      );
    }
    assert.equal(unitTsnLinksSortFactFor({ key: 'state' }), 'unit-tsn-links.serial_type');
    assert.equal(unitTsnLinksSortFactFor({ key: 'dates' }), 'unit-tsn-links.created');
    assert.equal(unitTsnLinksSortFactFor({ key: 'item' }), 'unit-tsn-links.station');
  });

  it('a rebound layout opens the station as a track without touching the skeleton', () => {
    const columns = unitTsnLinksCompoundColumnsFor({
      ...UNIT_TSN_LINKS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'unit-tsn-links.station' }],
    });
    const station = columns.find((c) => c.fieldId === 'unit-tsn-links.station');
    assert.equal(station?.key, 'status:1');
    assert.equal(station?.slotDisplayType, 'text');
  });
});

describe('resolveUnitTsnLinksSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveUnitTsnLinksSlotValue(r, 'unit-tsn-links.tsn'), {
      kind: 'value',
      text: '55123',
    });
    assert.deepEqual(resolveUnitTsnLinksSlotValue(r, 'unit-tsn-links.station'), {
      kind: 'value',
      text: 'TECH',
    });
    assert.deepEqual(resolveUnitTsnLinksSlotValue(r, 'unit-tsn-links.serial_type'), {
      kind: 'value',
      text: 'DEVICE',
    });
    assert.deepEqual(resolveUnitTsnLinksSlotValue(r, 'unit-tsn-links.shipment'), {
      kind: 'value',
      text: '8804',
    });
    assert.deepEqual(resolveUnitTsnLinksSlotValue(r, 'unit-tsn-links.tested_by'), {
      kind: 'value',
      text: 'Priya Raman',
    });
  });

  it('the stamp resolves to the ABSOLUTE instant — the engine owns the age face', () => {
    assert.deepEqual(resolveUnitTsnLinksSlotValue(row(), 'unit-tsn-links.created'), {
      kind: 'value',
      text: '2026-03-11T16:42:00.000Z',
    });
  });

  it('honest absence: an unattributed v1 record names no tester', () => {
    // Unlike an allocation, which the SYSTEM makes when no staffer does, a v1
    // row with no tester simply never recorded one.
    assert.deepEqual(
      resolveUnitTsnLinksSlotValue(row({ tested_by_name: null }), 'unit-tsn-links.tested_by'),
      { kind: 'value', text: null },
    );
    assert.deepEqual(
      resolveUnitTsnLinksSlotValue(row({ shipment_id: null }), 'unit-tsn-links.shipment'),
      { kind: 'value', text: null },
    );
  });

  it('never resolves the unpainted fnsku, even by its own name', () => {
    assert.equal(resolveUnitTsnLinksSlotValue(row(), 'unit-tsn-links.fnsku'), null);
  });

  it('an unknown field id resolves to nothing — bindings never cross families', () => {
    assert.equal(resolveUnitTsnLinksSlotValue(row(), 'unit-allocations.order'), null);
    assert.equal(resolveUnitTsnLinksSlotValue(row(), 'unit-tsn-links.nope'), null);
  });
});

describe('unitTsnLinksCompoundView', () => {
  it('puts the TSN id on identity and the station on the title', () => {
    const view = unitTsnLinksCompoundView(row());
    assert.equal(view.id, '55123');
    assert.equal(view.orderId, '55123');
    assert.equal(view.title, 'TECH');
  });

  it('names a pre-station record by its own id rather than `Untitled`', () => {
    assert.equal(unitTsnLinksCompoundView(row({ station_source: null })).title, 'TSN #55123');
  });

  it('paints the serial type verbatim — there is no house v1 vocabulary', () => {
    assert.equal(unitTsnLinksCompoundView(row()).stateLabel, 'DEVICE');
    assert.equal(unitTsnLinksCompoundView(row({ serial_type: 'BOX' })).stateLabel, 'BOX');
    assert.equal(unitTsnLinksCompoundView(row({ serial_type: '' })).stateLabel, 'Untyped');
  });

  it('uses the Hash line for the v1 stamp, with the family’s own hover', () => {
    const view = unitTsnLinksCompoundView(row());
    assert.equal(view.orderedAt?.dateKey, '2026-03-11');
    assert.ok(view.orderedAt?.label, 'Hash line must carry the civil face');
    assert.equal(view.startedHover, view.orderedAt?.tip);
  });

  it('invents no second temporal face — a v1 record has one stamp', () => {
    assert.equal(unitTsnLinksCompoundView(row()).delay, null);
  });

  it('never paints a photo, a tracking brand or an amount', () => {
    const view = unitTsnLinksCompoundView(row());
    assert.equal(view.thumbUrl, null);
    assert.equal(view.tracking, null);
    assert.equal(view.carrier, null);
    assert.equal(view.amount, null);
  });
});
