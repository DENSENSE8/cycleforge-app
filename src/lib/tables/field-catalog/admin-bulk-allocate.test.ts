/**
 * Bulk-allocate catalog guards, materialization, adapter and verb behaviour —
 * the family that replaced `/inventory/bulk-allocate`'s seven
 * hand-written `AdminTableColumn` objects.
 *
 * Four assertions here are load-bearing beyond the usual shape checks:
 *
 * - the DERIVED-FACT rule. `qty` and `eligible` are computed
 *   (`candidateQty` / `candidateStateWord`), so neither may carry a `paths`
 *   entry: there is no row column to name, and `quantity_str` in particular is
 *   the raw TEXT the retired page already knew was not the fact.
 * - the INELIGIBLE ROW offers no ENABLED verb. The retired cell disabled its
 *   `<Button>`; a port that silently left the verb live would let one click
 *   allocate an order there is no stock for.
 * - the SHORTFALL SENTENCE survives. It was the disabled button's tooltip and
 *   it is the only text that says HOW short the SKU is.
 * - the WRITE GATE. The action's `orders.view` `requirePermission` and its
 *   `revalidatePath` are the two lines a client-island port could quietly
 *   drop; the action lives in an RSC `page.tsx` that cannot be imported here
 *   (JSX, `next/cache`, server-only), so this is a source TRIPWIRE rather
 *   than a call-through.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import {
  ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS,
  adminBulkAllocateCompoundColumnsFor,
  adminBulkAllocateSortFactFor,
} from '@/components/inventory/bulk-allocate-grid/admin-bulk-allocate-grid-layout';
import { adminBulkAllocateCompoundView } from '@/components/inventory/bulk-allocate-grid/admin-bulk-allocate-row-view';
import { resolveAdminBulkAllocateRowActions } from '@/components/inventory/bulk-allocate-grid/admin-bulk-allocate-verbs';
import {
  toAllocationCandidateRow,
  type AllocationCandidateQueryRow,
  type AllocationCandidateRow,
} from '@/lib/inventory/allocation-candidate-row';
import {
  ADMIN_BULK_ALLOCATE_FIELD_CATALOG,
  ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT,
} from './admin-bulk-allocate';
import { resolveAdminBulkAllocateSlotValue } from './admin-bulk-allocate-resolve';
import { parseSlotLayout } from '../slot-layout';

/** Computed, never selected — a `paths` entry here would be a lie. */
const DERIVED_FIELD_IDS = ['admin-bulk-allocate.qty', 'admin-bulk-allocate.eligible'] as const;

const PAGE_SOURCE = readFileSync(
  fileURLToPath(new URL('../../../app/inventory/bulk-allocate/page.tsx', import.meta.url)),
  'utf8',
);

function row(overrides: Partial<AllocationCandidateRow> = {}): AllocationCandidateRow {
  return {
    order_id: 88214,
    order_id_text: '11-12345-67890',
    sku: 'QC45-BLK',
    condition: 'Used - Good',
    quantity_str: '2',
    available_stocked: 5,
    order_date: '2026-09-04T18:22:00.000Z',
    created_at: '2026-09-05T01:03:00.000Z',
    ...overrides,
  };
}

describe('admin-bulk-allocate catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = ADMIN_BULK_ALLOCATE_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of ADMIN_BULK_ALLOCATE_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'admin-bulk-allocate', `${field.id} is not a candidate fact`);
      assert.ok(field.id.startsWith('admin-bulk-allocate.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the EIGHT facts the seven retired cells painted, and no others', () => {
    assert.deepEqual(
      ADMIN_BULK_ALLOCATE_FIELD_CATALOG.map((f) => f.id),
      [
        'admin-bulk-allocate.order_id',
        'admin-bulk-allocate.ext_id',
        'admin-bulk-allocate.sku',
        'admin-bulk-allocate.condition',
        'admin-bulk-allocate.qty',
        'admin-bulk-allocate.available_stocked',
        'admin-bulk-allocate.eligible',
        'admin-bulk-allocate.ordered',
      ],
    );
  });

  it('keeps the DERIVED facts out of `paths` — they are not columns', () => {
    for (const id of DERIVED_FIELD_IDS) {
      const field = ADMIN_BULK_ALLOCATE_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field, `${id} left the catalog`);
      assert.equal(
        field.paths,
        undefined,
        `${id} is derived; a paths entry claims a row column that does not exist`,
      );
      // …and the resolver DOES answer it, which is where it has to live.
      assert.notEqual(resolveAdminBulkAllocateSlotValue(row(), id), null);
    }
    // The raw TEXT quantity is never a fact on any field: `qty` is the parse.
    for (const field of ADMIN_BULK_ALLOCATE_FIELD_CATALOG) {
      assert.ok(
        !Object.values(field.paths ?? {}).includes('quantity_str'),
        `${field.id} reads the raw quantity string instead of the parsed qty`,
      );
    }
  });

  it('product default parses, with the ORDER ID as identity and qty pinned first', () => {
    const parsed = parseSlotLayout(
      ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT,
      ADMIN_BULK_ALLOCATE_FIELD_CATALOG,
    );
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'admin-bulk-allocate.order_id');
    // The two facts read ACROSS rows are the two tracks…
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['admin-bulk-allocate.ext_id', 'admin-bulk-allocate.available_stocked'],
    );
    // …and the item cell's second line is qty · condition, never two tracks.
    // Line-qty identity puts `qty` first and no org can move it.
    assert.deepEqual(
      parsed.subtitleBindings.map((b) => b.fieldId),
      ['admin-bulk-allocate.qty', 'admin-bulk-allocate.condition'],
    );
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT.identityFieldId,
      ...ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = ADMIN_BULK_ALLOCATE_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map(
      (f) => f.id,
    );
    // Title, state pill and Dates chrome paint these three.
    assert.deepEqual(unbound, [
      'admin-bulk-allocate.sku',
      'admin-bulk-allocate.eligible',
      'admin-bulk-allocate.ordered',
    ]);
    for (const id of unbound) {
      const field = ADMIN_BULK_ALLOCATE_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('admin-bulk-allocate materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    // Compound paints subtitles INSIDE the item cell — never as tracks.
    assert.equal(
      ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:'))
        .length,
      0,
    );
    assert.equal(
      ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:'))
        .length,
      ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const label = (key: string) =>
      ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'SKU');
    assert.equal(label('dates'), 'Ordered');
    assert.equal(label('state'), 'Allocatable');
    const identity = ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'admin-bulk-allocate.order_id');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`slot-table-family.ts`). "Order id" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = adminBulkAllocateCompoundColumnsFor({
      ...ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'admin-bulk-allocate.ordered' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'admin-bulk-allocate.ordered');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS) {
      if (isSlotTableChromeTrack(col.key)) {
        assert.equal(adminBulkAllocateSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        adminBulkAllocateSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(adminBulkAllocateSortFactFor({ key: 'item' }), 'admin-bulk-allocate.sku');
    assert.equal(adminBulkAllocateSortFactFor({ key: 'dates' }), 'admin-bulk-allocate.ordered');
    // Sorting by the pill groups every Ready row together — the desk's point.
    assert.equal(adminBulkAllocateSortFactFor({ key: 'state' }), 'admin-bulk-allocate.eligible');
  });
});

describe('admin-bulk-allocate resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of ADMIN_BULK_ALLOCATE_FIELD_CATALOG) {
      assert.notEqual(
        resolveAdminBulkAllocateSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves qty as the page\u2019s floor-clamped parse, not the raw string', () => {
    const qty = (r: AllocationCandidateRow) =>
      resolveAdminBulkAllocateSlotValue(r, 'admin-bulk-allocate.qty');
    assert.deepEqual(qty(row({ quantity_str: '3' })), { kind: 'value', text: '3' });
    // A blank, non-numeric or fractional quantity still means at least one unit.
    assert.deepEqual(qty(row({ quantity_str: null })), { kind: 'value', text: '1' });
    assert.deepEqual(qty(row({ quantity_str: 'two' })), { kind: 'value', text: '1' });
    assert.deepEqual(qty(row({ quantity_str: '2.7' })), { kind: 'value', text: '2' });
  });

  it('resolves eligibility as the pill\u2019s WORD, so sort and search agree with it', () => {
    const word = (r: AllocationCandidateRow) =>
      resolveAdminBulkAllocateSlotValue(r, 'admin-bulk-allocate.eligible');
    assert.deepEqual(word(row({ quantity_str: '2', available_stocked: 5 })), {
      kind: 'value',
      text: 'Ready',
    });
    assert.deepEqual(word(row({ quantity_str: '4', available_stocked: 1 })), {
      kind: 'value',
      text: 'Short',
    });
    assert.deepEqual(word(row({ quantity_str: '1', available_stocked: 0 })), {
      kind: 'value',
      text: 'No stock',
    });
  });

  it('resolves `ordered` to the absolute instant, preferring the purchase stamp', () => {
    assert.deepEqual(resolveAdminBulkAllocateSlotValue(row(), 'admin-bulk-allocate.ordered'), {
      kind: 'value',
      text: '2026-09-04T18:22:00.000Z',
    });
    assert.deepEqual(
      resolveAdminBulkAllocateSlotValue(row({ order_date: null }), 'admin-bulk-allocate.ordered'),
      { kind: 'value', text: '2026-09-05T01:03:00.000Z' },
    );
  });

  it('blank facts resolve to null text rather than an empty chip', () => {
    assert.deepEqual(
      resolveAdminBulkAllocateSlotValue(row({ order_id_text: null }), 'admin-bulk-allocate.ext_id'),
      { kind: 'value', text: null },
    );
    assert.deepEqual(
      resolveAdminBulkAllocateSlotValue(row({ condition: '  ' }), 'admin-bulk-allocate.condition'),
      { kind: 'value', text: null },
    );
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveAdminBulkAllocateSlotValue(row(), 'orders.picked'), null);
  });
});

describe('admin-bulk-allocate row view', () => {
  it('paints the SKU as the title and allocatability as the pill word', () => {
    const view = adminBulkAllocateCompoundView(row());
    assert.equal(view.id, '88214');
    assert.equal(view.title, 'QC45-BLK');
    assert.equal(view.orderId, '88214');
    assert.equal(view.stateLabel, 'Ready');
    assert.equal(view.stateTone, 'done');
    // Nothing to explain on a row that can be allocated.
    assert.equal(view.stateTip, undefined);
    // No carrier, no marketplace, no money, no photo on a candidate row.
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('carries the shortfall SENTENCE the retired tooltip had', () => {
    const short = adminBulkAllocateCompoundView(row({ quantity_str: '3', available_stocked: 1 }));
    assert.equal(short.stateLabel, 'Short');
    assert.equal(short.stateTone, 'alert');
    assert.equal(short.stateTip, 'Need 3 stocked, only 1 available');
    const none = adminBulkAllocateCompoundView(row({ quantity_str: '1', available_stocked: 0 }));
    assert.equal(none.stateLabel, 'No stock');
    assert.equal(none.stateTip, 'Need 1 stocked, only 0 available');
  });

  it('uses BOTH date lines: the civil day and the wait age', () => {
    const view = adminBulkAllocateCompoundView(row());
    assert.equal(view.orderedAt?.dateKey?.length, 10);
    assert.ok(view.orderedAt?.tip?.startsWith('Ordered · '));
    assert.equal(view.startedHover, view.orderedAt?.tip);
    // Calendar line is the age, never `--`, and never a fake deadline.
    assert.match(String(view.delay?.faceLabel), /^\d+[dmy] waiting$/);
    assert.equal(view.delay?.overdue, false);
  });

  it('names the IMPORT stamp as an import when the channel sent no order date', () => {
    const view = adminBulkAllocateCompoundView(row({ order_date: null }));
    assert.ok(view.orderedAt?.tip?.startsWith('Imported · '));
    assert.match(String(view.orderedAt?.tip), /no order date came from the channel/);
  });

  it('never invents a title or a date face for a malformed row', () => {
    const view = adminBulkAllocateCompoundView(
      row({ sku: '', order_date: null, created_at: null }),
    );
    assert.equal(view.title, 'Order #88214');
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
    assert.equal(view.startedHover, undefined);
  });
});

describe('admin-bulk-allocate verbs', () => {
  const handlers = { onAllocate: () => {} };

  it('offers ONE enabled Allocate on a row with enough stock', () => {
    const actions = resolveAdminBulkAllocateRowActions(row(), handlers);
    assert.deepEqual(
      actions.map((a) => a.key),
      ['allocate'],
    );
    assert.equal(actions[0]?.label, 'Allocate');
    assert.equal(actions[0]?.disabled, false);
    assert.equal(actions[0]?.face, 'trailing');
  });

  it('offers NO ENABLED verb on an ineligible row, and says how short it is', () => {
    const short = row({ quantity_str: '4', available_stocked: 1 });
    const actions = resolveAdminBulkAllocateRowActions(short, handlers);
    assert.equal(
      actions.filter((a) => !a.disabled).length,
      0,
      'an ineligible candidate must not offer a live Allocate',
    );
    // The shortfall is readable on the verb itself, as it was on the retired
    // disabled button's tooltip.
    assert.equal(actions[0]?.label, 'Need 4 stocked, only 1 available');
  });

  it('disables the verb while that row\u2019s allocation is in flight', () => {
    const target = row();
    const actions = resolveAdminBulkAllocateRowActions(target, {
      ...handlers,
      isPending: (candidate) => candidate.order_id === target.order_id,
    });
    assert.equal(actions[0]?.disabled, true);
    assert.equal(actions[0]?.label, 'Allocating…');
  });

  it('runs the mount\u2019s handler, not a verb-local write', () => {
    const seen: number[] = [];
    const actions = resolveAdminBulkAllocateRowActions(row(), {
      onAllocate: (candidate) => seen.push(candidate.order_id),
    });
    actions[0]?.onSelect();
    assert.deepEqual(seen, [88214]);
  });
});

describe('admin-bulk-allocate wire row', () => {
  it('ISO-normalizes both stamps so no Date crosses the RSC boundary', () => {
    const raw: AllocationCandidateQueryRow = {
      order_id: 12,
      order_id_text: null,
      sku: 'SKU-1',
      condition: null,
      quantity_str: '1',
      available_stocked: 0,
      order_date: new Date('2026-09-04T18:22:00.000Z'),
      created_at: new Date('2026-09-05T01:03:00.000Z'),
    };
    const wire = toAllocationCandidateRow(raw);
    assert.equal(wire.order_date, '2026-09-04T18:22:00.000Z');
    assert.equal(wire.created_at, '2026-09-05T01:03:00.000Z');
  });

  it('keeps a missing or unparseable stamp as null rather than an Invalid Date', () => {
    const wire = toAllocationCandidateRow({
      order_id: 12,
      order_id_text: null,
      sku: 'SKU-1',
      condition: null,
      quantity_str: '1',
      available_stocked: 0,
      order_date: '0000-00-00',
      created_at: null,
    });
    assert.equal(wire.order_date, null);
    assert.equal(wire.created_at, null);
  });
});

describe('admin-bulk-allocate page tripwire', () => {
  it('still gates the write on `orders.view` and still revalidates', () => {
    // The gate sits OUTSIDE the try — `requirePermission` signals denial by
    // throwing NEXT_REDIRECT, and from inside a catch it was swallowed.
    assert.match(PAGE_SOURCE, /requirePermission\('orders\.view', \{ enforce: true \}\)/);
    assert.match(PAGE_SOURCE, /revalidatePath\('\/inventory\/bulk-allocate'\)/);
    // And the action is still a SERVER action, not something the island runs.
    assert.match(PAGE_SOURCE, /async function allocateOne\(formData: FormData\)[\s\S]{0,40}'use server'/);
  });
});
