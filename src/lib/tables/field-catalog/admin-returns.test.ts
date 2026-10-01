/** Admin › Returns catalog guards + resolver behaviour — the family that replaced the dock's seven hand-written `AdminTableColumn` objects. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import {
  ADMIN_RETURNS_COMPOUND_COLUMNS,
  adminReturnsCompoundColumnsFor,
  adminReturnsSortFactFor,
} from '@/components/inventory/returns-grid/admin-returns-grid-layout';
import { adminReturnsCompoundView } from '@/components/inventory/returns-grid/admin-returns-row-view';
import type { RecentReturnRow } from '@/lib/inventory/returns-row';
import { readReturnOrderId, toRecentReturnRow } from '@/lib/inventory/returns-row';
import { ADMIN_RETURNS_FIELD_CATALOG, ADMIN_RETURNS_PRODUCT_LAYOUT } from './admin-returns';
import { resolveAdminReturnsSlotValue } from './admin-returns-resolve';
import { INVENTORY_EVENTS_FIELD_CATALOG } from './inventory-events';


/** The facts this desk borrows from the Ledger rather than re-naming. */
const REUSED_FIELD_IDS = [
  'inventory-events.sku',
  'inventory-events.occurred',
  'inventory-events.status_change',
  'inventory-events.notes',
  'inventory-events.actor',
] as const;

/** Chrome tracks this mount filters off the shared skeleton. */

function row(overrides: Partial<RecentReturnRow> = {}): RecentReturnRow {
  return {
    id: 4412,
    occurred_at: '2026-09-10T16:04:12.000Z',
    serial_unit_id: 31846,
    sku: '00106-BK',
    prev_status: 'SHIPPED',
    scan_token: '1Z999AA10123456784',
    notes: 'customer return — screen scratched',
    order_id: 8821,
    actor_name: 'David',
    ...overrides,
  };
}

describe('admin-returns catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = ADMIN_RETURNS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of ADMIN_RETURNS_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(
        field.id.startsWith(`${field.family}.`),
        `${field.id} is not qualified by its own family (${field.family})`,
      );
      assert.ok(
        field.family === 'admin-returns' || field.family === 'inventory-events',
        `${field.id} belongs to neither this family nor the Ledger it reuses`,
      );
    }
  });

  it('reuses the Ledger fields BY REFERENCE — a copy would be a fork', () => {
    for (const id of REUSED_FIELD_IDS) {
      const mine = ADMIN_RETURNS_FIELD_CATALOG.find((f) => f.id === id);
      const ledger = INVENTORY_EVENTS_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(ledger, `${id} vanished from the inventory-events catalog`);
      assert.equal(mine, ledger, `${id} is a local copy, not the Ledger's field`);
    }
  });

  it('mints only the three facts the Ledger row cannot carry', () => {
    const own = ADMIN_RETURNS_FIELD_CATALOG.filter((f) => f.family === 'admin-returns');
    assert.deepEqual(
      own.map((f) => f.id),
      ['admin-returns.unit', 'admin-returns.tracking', 'admin-returns.order_ref'],
    );
    // The return label is a TRACKING face, never a bare id chip.
    assert.equal(own.find((f) => f.id === 'admin-returns.tracking')?.displayType, 'tracking');
  });

  it('product default parses against the catalog, and the unit is the identity', () => {
    const parsed = ADMIN_RETURNS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'admin-returns.unit');
    // When + Who are tracks; reason + order ref ride the under-title line.
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['inventory-events.occurred', 'inventory-events.actor'],
    );
    assert.deepEqual(
      parsed.subtitleBindings.map((b) => b.fieldId),
      ['inventory-events.notes', 'admin-returns.order_ref'],
    );
  });
});

describe('admin-returns materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = ADMIN_RETURNS_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    // Compound paints subtitles INSIDE the item cell — never as tracks.
    assert.equal(
      ADMIN_RETURNS_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      ADMIN_RETURNS_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      ADMIN_RETURNS_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('the identity chrome track carries the UNIT, not the Orders default', () => {
    const identity = ADMIN_RETURNS_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'admin-returns.unit');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`data-table-family.ts`). "Unit" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = adminReturnsCompoundColumnsFor({
      ...ADMIN_RETURNS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'admin-returns.tracking' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'admin-returns.tracking');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of ADMIN_RETURNS_COMPOUND_COLUMNS) {
      if (isDataTableChromeColumn(col.key) || col.key === '_fill') {
        assert.equal(adminReturnsSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        adminReturnsSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(
      adminReturnsSortFactFor({ key: 'state' }),
      'inventory-events.status_change',
    );
  });
});

describe('admin-returns resolver', () => {
  it('answers every REUSED inventory-events id off a returns row', () => {
    const r = row();
    assert.deepEqual(resolveAdminReturnsSlotValue(r, 'inventory-events.sku'), {
      kind: 'value',
      text: '00106-BK',
    });
    // Never the clock: the same row must resolve the same text at any time.
    assert.deepEqual(resolveAdminReturnsSlotValue(r, 'inventory-events.occurred'), {
      kind: 'value',
      text: '2026-09-10T16:04:12.000Z',
    });
    // The landing end is constant on this feed, so the fact is where it came FROM.
    assert.deepEqual(resolveAdminReturnsSlotValue(r, 'inventory-events.status_change'), {
      kind: 'value',
      text: 'SHIPPED',
    });
    assert.deepEqual(resolveAdminReturnsSlotValue(r, 'inventory-events.notes'), {
      kind: 'value',
      text: 'customer return — screen scratched',
    });
    assert.deepEqual(resolveAdminReturnsSlotValue(r, 'inventory-events.actor'), {
      kind: 'person',
      staffId: null,
      name: 'David',
    });
  });

  it('an unattributed intake reads `system`, never an empty person cell', () => {
    assert.deepEqual(resolveAdminReturnsSlotValue(row({ actor_name: null }), 'inventory-events.actor'), {
      kind: 'person',
      staffId: null,
      name: 'system',
    });
  });

  it('the order reference is its own fact, not a suffix on the reason', () => {
    assert.deepEqual(resolveAdminReturnsSlotValue(row(), 'admin-returns.order_ref'), {
      kind: 'value',
      text: 'ord#8821',
    });
    assert.deepEqual(resolveAdminReturnsSlotValue(row({ order_id: null }), 'admin-returns.order_ref'), {
      kind: 'value',
      text: null,
    });
    // …and the reason never carries it.
    assert.deepEqual(resolveAdminReturnsSlotValue(row(), 'inventory-events.notes'), {
      kind: 'value',
      text: 'customer return — screen scratched',
    });
  });

  it('resolves the unit and the return label', () => {
    assert.deepEqual(resolveAdminReturnsSlotValue(row(), 'admin-returns.unit'), {
      kind: 'value',
      text: '31846',
    });
    assert.deepEqual(resolveAdminReturnsSlotValue(row(), 'admin-returns.tracking'), {
      kind: 'value',
      text: '1Z999AA10123456784',
    });
    assert.deepEqual(resolveAdminReturnsSlotValue(row({ serial_unit_id: null }), 'admin-returns.unit'), {
      kind: 'value',
      text: null,
    });
  });

  it('unknown field ids resolve null (the cell dashes)', () => {
    assert.equal(resolveAdminReturnsSlotValue(row(), 'admin-returns.nope'), null);
    // Bindings do not reach facts this feed has no column for.
    assert.equal(resolveAdminReturnsSlotValue(row(), 'inventory-events.bin'), null);
    assert.equal(resolveAdminReturnsSlotValue(row(), 'orders.total'), null);
  });
});

describe('admin-returns row view', () => {
  it('paints unit over return tracking, and the SKU as the linked title', () => {
    const view = adminReturnsCompoundView(row());
    assert.equal(view.identityFace?.value, '31846');
    assert.equal(view.tracking, '1Z999AA10123456784');
    assert.equal(view.title, '00106-BK');
    assert.equal(view.titleHref, '/inventory/health/sku/00106-BK');
  });

  it('the state pill lands on Returned and puts the move on the hover', () => {
    assert.equal(adminReturnsCompoundView(row()).stateLabel, 'Returned');
    assert.equal(adminReturnsCompoundView(row()).stateTip, 'SHIPPED → Returned');
    assert.equal(adminReturnsCompoundView(row({ prev_status: null })).stateTip, undefined);
  });

  it('names a row by its unit when the event carries no SKU', () => {
    const view = adminReturnsCompoundView(row({ sku: null }));
    assert.equal(view.title, 'Unit #31846');
    assert.equal(view.titleHref, null);
  });
});

describe('recent-return row mapping', () => {
  it('lifts payload.order_id and normalizes the instant to ISO', () => {
    const mapped = toRecentReturnRow({
      id: 1,
      occurred_at: new Date('2026-09-10T16:04:12.000Z'),
      serial_unit_id: 7,
      sku: 'ABC',
      prev_status: 'SHIPPED',
      scan_token: null,
      notes: null,
      payload: { order_id: 8821, reason_code: 'damaged' },
      actor_name: null,
    });
    assert.equal(mapped.occurred_at, '2026-09-10T16:04:12.000Z');
    assert.equal(mapped.order_id, 8821);
    // Nothing else in the bag crosses the boundary.
    assert.ok(!('payload' in mapped));
  });

  it('reads a string order id and refuses everything that is not one', () => {
    assert.equal(readReturnOrderId({ order_id: '8821' }), 8821);
    assert.equal(readReturnOrderId({ order_id: 0 }), null);
    assert.equal(readReturnOrderId({ order_id: 12.5 }), null);
    assert.equal(readReturnOrderId({ order_id: '' }), null);
    assert.equal(readReturnOrderId({ order_id: { id: 1 } }), null);
    assert.equal(readReturnOrderId(null), null);
  });
});
