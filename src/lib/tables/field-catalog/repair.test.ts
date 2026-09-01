/**
 * Repair catalog guards + resolver behaviour — wave 1.4's seventh family, and
 * the one whose sort does NOT ride `?colsort=`.
 *
 * Repair shares `?sort=`/`?dir=` with a chrome dropdown, and
 * `repair-display-sort.ts` keeps that vocabulary local on purpose so a
 * rewritten display cannot change the meaning of a bookmarked URL. The tests
 * that matter most here pin the ONE direction of that derivation: a mounted
 * track resolves to a word the URL already understands, and no port mints a new
 * one.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  REPAIR_DISPLAY_SORT_OPTIONS,
  isRepairColumnSort,
} from '@/lib/repair/repair-display-sort';
import {
  REPAIR_SHEET_COLUMNS,
  defaultDirForRepairColumn,
  repairColumnKeyForSort,
  repairSheetColumnsFor,
  repairSortFactFor,
} from '@/lib/repair/repair-grid-layout';
import { REPAIR_FIELD_CATALOG, REPAIR_PRODUCT_LAYOUT } from './repair';
import { resolveRepairSlotValue } from './repair-resolve';
import { parseSlotLayout } from '../slot-layout';

function repair(overrides: Partial<RSRecord> = {}): RSRecord {
  return {
    id: 412,
    created_at: '2026-08-18T09:00:00.000Z',
    updated_at: '2026-08-30T09:00:00.000Z',
    ticket_number: 'RS-0412',
    contact_info: 'Dana Vo, 5551234567, dana@example.com',
    product_title: 'Bose Wave Radio IV',
    price: '120',
    issue: 'No power',
    serial_number: '9M52B2C4',
    status: 'IN_PROGRESS',
    source_order_id: null,
    ...overrides,
  } as RSRecord;
}

describe('repair catalog', () => {
  it('has unique ids, all repair-family, each bindable somewhere', () => {
    const ids = REPAIR_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of REPAIR_FIELD_CATALOG) {
      assert.equal(field.family, 'repair', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('repair.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the core view)', () => {
    const parsed = parseSlotLayout(REPAIR_PRODUCT_LAYOUT, REPAIR_FIELD_CATALOG);
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'repair.service');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'repair.created' },
      { fieldId: 'repair.customer' },
      { fieldId: 'repair.ticket' },
    ]);
  });

  it('the RS-#### is a bound FACT, not the identity — a field cannot be both', () => {
    // The write gate counts identity toward duplicate bindings, so the row's
    // handle and one of its columns must be different fields.
    assert.equal(REPAIR_PRODUCT_LAYOUT.identityFieldId, 'repair.service');
    assert.ok(
      REPAIR_PRODUCT_LAYOUT.statusBindings.some((b) => b.fieldId === 'repair.ticket'),
    );
  });
});

describe('repairSheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's CORE view scan order", () => {
    assert.deepEqual(
      REPAIR_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['title', null],
        ['status:1', 'repair.created'],
        ['status:2', 'repair.customer'],
        ['status:3', 'repair.ticket'],
      ],
    );
  });

  it('every sortable track maps onto a word the URL already understands', () => {
    const words = new Set(REPAIR_DISPLAY_SORT_OPTIONS.map((o) => o.id));
    const all = repairSheetColumnsFor({
      ...REPAIR_PRODUCT_LAYOUT,
      statusBindings: REPAIR_FIELD_CATALOG.filter((f) => f.id !== 'repair.service').map((f) => ({
        fieldId: f.id,
      })),
    });
    for (const col of all) {
      const word = repairSortFactFor(col);
      if (word === null) continue;
      assert.ok(words.has(word), `${col.fieldId ?? col.key} → ${word} is a known ?sort= value`);
      assert.ok(isRepairColumnSort(word));
    }
  });

  it('a fact with no URL word is simply unsortable — no port mints a new one', () => {
    const withStatus = repairSheetColumnsFor({
      ...REPAIR_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'repair.status' }],
    });
    const track = withStatus.find((c) => c.fieldId === 'repair.status');
    assert.ok(track);
    assert.equal(repairSortFactFor(track), null);
  });

  it('a bookmarked ?sort= still lights the right header after a rebind', () => {
    const rebound = repairSheetColumnsFor({
      ...REPAIR_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'repair.ticket' }, { fieldId: 'repair.created' }],
    });
    assert.equal(repairColumnKeyForSort(rebound, 'ticket'), 'status:1');
    assert.equal(repairColumnKeyForSort(rebound, 'date'), 'status:2');
    assert.equal(repairColumnKeyForSort(rebound, null), null);
  });

  it('direction defers to the URL vocabulary, so header and dropdown agree', () => {
    // `date` opens newest-first there; everything else ascends.
    assert.equal(defaultDirForRepairColumn(REPAIR_SHEET_COLUMNS, 'status:1'), 'desc');
    assert.equal(defaultDirForRepairColumn(REPAIR_SHEET_COLUMNS, 'status:2'), 'asc');
    assert.equal(defaultDirForRepairColumn(REPAIR_SHEET_COLUMNS, 'title'), 'asc');
  });
});

describe('resolveRepairSlotValue', () => {
  it('resolves each catalog field, falling back to the legacy contact_info', () => {
    const r = repair({ customer_name: null, customer_phone: null } as Partial<RSRecord>);
    assert.deepEqual(resolveRepairSlotValue(r, 'repair.service'), { kind: 'value', text: '#412' });
    assert.deepEqual(resolveRepairSlotValue(r, 'repair.ticket'), {
      kind: 'value',
      text: 'RS-0412',
    });
    assert.deepEqual(resolveRepairSlotValue(r, 'repair.customer'), {
      kind: 'value',
      text: 'Dana Vo',
    });
    assert.deepEqual(resolveRepairSlotValue(r, 'repair.price'), { kind: 'value', text: '$120' });
    assert.ok((resolveRepairSlotValue(r, 'repair.phone') as { text: string | null }).text);
  });

  it('a walk-in says so — an honest word for the absence, not a broken order id', () => {
    assert.deepEqual(resolveRepairSlotValue(repair(), 'repair.order'), {
      kind: 'value',
      text: 'Walk-in',
    });
    assert.deepEqual(
      resolveRepairSlotValue(repair({ source_order_id: '09-88231' }), 'repair.order'),
      { kind: 'value', text: '09-88231' },
    );
  });

  it('honest absence: no quote resolves null, never $0', () => {
    assert.deepEqual(resolveRepairSlotValue(repair({ price: '' }), 'repair.price'), {
      kind: 'value',
      text: null,
    });
  });

  it('a price that already carries a $ is not doubled', () => {
    assert.deepEqual(resolveRepairSlotValue(repair({ price: '$95' }), 'repair.price'), {
      kind: 'value',
      text: '$95',
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveRepairSlotValue(repair(), 'repair.ghost'), null);
  });
});
