/**
 * Cross-family guard for the grid column TIER contract.
 *
 * Every Workbench spreadsheet resolves its visible tracks through one rule
 * (`resolveGridColumns`). That rule is only safe if the column models obey two
 * invariants, and both are easy to break by hand in a layout SoT:
 *
 *  1. `tier: 'optional'` REQUIRES a `hideKey`. `hideKey` is the only channel a
 *     staffer can opt in through, so an optional column without one is
 *     permanently invisible — a column that silently never renders.
 *  2. Frozen columns (`frozen: true`) must carry NO `hideKey` and NO `tier`.
 *     They are the identity pane; offering them in the Fields menu would let a
 *     staffer hide the checkbox gutter, the order, or the product title.
 *  3. The frozen pane must be a CONTIGUOUS PREFIX of the canonical order — the
 *     sticky-left offset sums the widths of the frozen columns before a given
 *     one, so a frozen column with a scrolling column ahead of it would pin at
 *     the wrong origin.
 *
 * It also pins each surface's DEFAULT (core) set, so making a column optional —
 * which changes what every staffer sees on their next load — is a deliberate,
 * reviewed edit rather than a one-character drive-by.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { INCOMING_GRID_COLUMNS } from '@/lib/receiving/incoming-grid-layout';
import { ORDERS_QUEUE_COLUMNS } from '@/lib/dashboard-order-row-layout';
import { CATALOG_GRID_COLUMNS } from '@/lib/products/catalog-grid-layout';
import { PICKUP_GRID_COLUMNS } from '@/components/receiving/pickup/grid/pickup-grid-layout';
import { REPAIR_GRID_COLUMNS } from '@/lib/repair/repair-grid-layout';
import { WARRANTY_GRID_COLUMNS } from '@/components/warranty/grid/warranty-grid-layout';
import { READY_GRID_COLUMNS } from '@/components/outbound/ready/grid/ready-grid-layout';
import { TRACKING_EXCEPTIONS_GRID_COLUMNS } from '@/components/tracking-exceptions/grid/tracking-exceptions-grid-layout';
import { UNFOUND_GRID_COLUMNS } from '@/components/receiving/unfound/grid/unfound-grid-layout';
import { BINS_GRID_COLUMNS } from '@/components/warehouse/bins-grid/bins-grid-layout';
import { MY_DAY_GRID_COLUMNS } from '@/lib/my-day/my-day-grid-layout';
import { CATALOG_LINK_GRID_COLUMNS } from '@/features/review/catalog-link/grid/catalog-link-grid-layout';
import { IMPORT_EXCEPTION_GRID_COLUMNS } from '@/features/review/catalog-link/grid/import-exception-grid-layout';

/**
 * Structural columns are the family's FROZEN IDENTITY PANE, read off the model's
 * own `frozen` flag rather than a hardcoded key list — the pane is a per-surface
 * answer (Orders freezes `select · order · title`; everyone else freezes
 * `select · title`), and a key list here would silently stop guarding the moment
 * a surface declared a different one.
 */
const isStructural = (c: LedgerGridColumnModel) => c.frozen === true;

const FAMILIES: Record<string, readonly LedgerGridColumnModel[]> = {
  receiving: RECEIVING_GRID_COLUMNS,
  incoming: INCOMING_GRID_COLUMNS,
  orders: ORDERS_QUEUE_COLUMNS,
  catalog: CATALOG_GRID_COLUMNS,
  pickup: PICKUP_GRID_COLUMNS,
  repair: REPAIR_GRID_COLUMNS,
  warranty: WARRANTY_GRID_COLUMNS,
  ready: READY_GRID_COLUMNS,
  'tracking-exceptions': TRACKING_EXCEPTIONS_GRID_COLUMNS,
  unfound: UNFOUND_GRID_COLUMNS,
  bins: BINS_GRID_COLUMNS,
  'my-day': MY_DAY_GRID_COLUMNS,
  'catalog-link': CATALOG_LINK_GRID_COLUMNS,
  'import-exception': IMPORT_EXCEPTION_GRID_COLUMNS,
};

const coreKeys = (columns: readonly LedgerGridColumnModel[]) =>
  columns.filter((c) => c.tier !== 'optional').map((c) => c.key);

describe('grid column tier contract', () => {
  for (const [name, columns] of Object.entries(FAMILIES)) {
    it(`${name}: every optional column can actually be opted into`, () => {
      for (const c of columns) {
        if (c.tier !== 'optional') continue;
        assert.ok(
          c.hideKey,
          `${name}.${c.key} is tier:'optional' but has no hideKey — it could never be turned on`,
        );
      }
    });

    it(`${name}: frozen identity columns are never hideable`, () => {
      const frozen = columns.filter(isStructural);
      assert.ok(frozen.length > 0, `${name} declares no frozen identity pane`);
      for (const c of frozen) {
        assert.equal(c.hideKey, undefined, `${name}.${c.key} must not carry a hideKey`);
        assert.equal(c.tier, undefined, `${name}.${c.key} must not carry a tier`);
      }
    });

    it(`${name}: the frozen pane is a contiguous leading prefix`, () => {
      const firstScrolling = columns.findIndex((c) => !isStructural(c));
      const stragglers = columns.slice(firstScrolling).filter(isStructural).map((c) => c.key);
      assert.deepEqual(
        stragglers,
        [],
        `${name}: ${stragglers.join(', ')} are frozen but sit after a scrolling column — ` +
          'sticky-left offset math only holds for a leading prefix',
      );
      assert.equal(columns[0]?.key, 'select', `${name} must lead with the select gutter`);
    });

    it(`${name}: column keys are unique`, () => {
      const keys = columns.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length, `${name} has duplicate column keys`);
    });
  }
});

describe('default (core) column sets — change these deliberately', () => {
  // Receiving is the surface the lean default was designed around: what is it,
  // WHERE IN THE LIFECYCLE (`status` — dot · stage name · day · time, one track
  // since 2026-08-02), how many, where in the flow, and the two identifiers an
  // operator scans. condition / platform / serial are opt-in because they are
  // usually still empty at the moment the row is scanned; `date` and `stage`
  // joined them when `status` absorbed both halves of the same fact.
  it('receiving ships the lean scan set', () => {
    assert.deepEqual(coreKeys(RECEIVING_GRID_COLUMNS), [
      'select',
      'title',
      'status',
      'qty',
      'location',
      'order',
      'tracking',
    ]);
  });

  // Catalog is a product LIST first: what it is, how it is keyed, whether it is
  // wired to the inventory master, and whether it needs attention. The four
  // roll-up COUNTS (channels · manuals · qc · orders) are drill-down analytics,
  // so they opt in rather than turning first load into a numbers table.
  it('catalog ships the lean product set', () => {
    assert.deepEqual(coreKeys(CATALOG_GRID_COLUMNS), [
      'select',
      'title',
      'sku',
      'inventory',
      'status',
    ]);
  });

  // Pickup answers the counter operator's four questions: what, which LCPU
  // order, when, still Draft? Line detail (sku · qty · cond · price) is rolled
  // up by the group summary and shown in full by the detail pane.
  it('pickup ships the lean counter set', () => {
    assert.deepEqual(coreKeys(PICKUP_GRID_COLUMNS), [
      'select',
      'title',
      'order',
      'date',
      'status',
    ]);
  });

  // Repair: what came in, when, whose it is, and the RS-#### the desk quotes.
  // phone is contact detail behind the ticket, price is a quote the detail pane
  // owns, and `order` reads "Walk-in" on almost every row.
  it('repair ships the lean desk set', () => {
    assert.deepEqual(coreKeys(REPAIR_GRID_COLUMNS), [
      'select',
      'title',
      'date',
      'customer',
      'ticket',
    ]);
  });

  // Warranty answers the five questions a support operator on a phone call asks:
  // what is it, which claim, whose is it, what state, how much cover is left,
  // and when was it logged. `serial` opts in because it is the key you arrive
  // BY (the sidebar search already matches it), not one you scan down a column.
  it('warranty ships the lean support set', () => {
    assert.deepEqual(coreKeys(WARRANTY_GRID_COLUMNS), [
      'select',
      'title',
      'claim',
      'customer',
      'status',
      'warranty',
      'logged',
      'ticket',
    ]);
  });

  // Ready is tested HISTORY: which unit, did it pass, where is it going, what
  // grade, when, anything to do. `reasons` / `velocity` are the WHY behind
  // `destination` — rationale you open, not a column you scan (and `reasons` is
  // a chip list, the widest thing on the row).
  it('ready ships the lean history set', () => {
    assert.deepEqual(coreKeys(READY_GRID_COLUMNS), [
      'select',
      'title',
      'verdict',
      'destination',
      'condition',
      'tested',
      'action',
    ]);
  });

  // Unfound is the PO-mailbox triage map: what is it, which ticket, the two
  // team notes, check state, and the Push escape. The hand-rolled table always
  // showed the full set — keep that as the core default.
  it('unfound ships the full triage set', () => {
    assert.deepEqual(coreKeys(UNFOUND_GRID_COLUMNS), [
      'select',
      'title',
      'ticket',
      'usaNote',
      'vietnamNote',
      'checked',
      'action',
    ]);
  });

  // Bins is the warehouse floor map: which bin, where, how many SKUs/units,
  // how full, when last counted, what flags. The hand-rolled table always
  // showed the full set — keep that as the core default.
  it('bins ships the full warehouse set', () => {
    assert.deepEqual(coreKeys(BINS_GRID_COLUMNS), [
      'select',
      'barcode',
      'location',
      'sku_count',
      'total_qty',
      'fill',
      'last_counted',
      'status',
    ]);
  });

  // Tracking Exceptions answers the ops triage questions: which tracking, which
  // carrier, why unmatched, what state, when logged, and the row actions.
  // Source / staff / retries / last check / notes are attribution or Zoho-sync
  // detail — opt-in when investigating one row.
  it('tracking-exceptions ships the lean triage set', () => {
    assert.deepEqual(coreKeys(TRACKING_EXCEPTIONS_GRID_COLUMNS), [
      'select',
      'title',
      'carrier',
      'reason',
      'status',
      'created',
      'actions',
    ]);
  });

  // Review · Catalog link asks four questions per tab without a click. `sku` is
  // null on most chore rows (a chore exists BECAUSE nothing resolved) and
  // `sheet` is a debugging pointer into the source spreadsheet; `first` and
  // `last` answer the same question at two ends, so only `last` — "is this
  // still happening" — ships.
  it('catalog-link ships the lean triage set', () => {
    assert.deepEqual(coreKeys(CATALOG_LINK_GRID_COLUMNS), [
      'select',
      'title',
      'item',
      'source',
      'orders',
      'last',
    ]);
  });

  it('import-exception ships the lean lookup set', () => {
    assert.deepEqual(coreKeys(IMPORT_EXCEPTION_GRID_COLUMNS), [
      'select',
      'title',
      'order',
      'source',
      'tracking',
      'seen',
      'last',
    ]);
  });

  it('every family keeps its frozen identity pane in the default set', () => {
    for (const [name, columns] of Object.entries(FAMILIES)) {
      const core = coreKeys(columns);
      for (const c of columns.filter(isStructural)) {
        assert.ok(core.includes(c.key), `${name} dropped identity column ${c.key} from its default`);
      }
    }
  });

  it('no family defaults to an empty grid', () => {
    for (const [name, columns] of Object.entries(FAMILIES)) {
      // Structural columns alone are not a usable grid — at least one FACT
      // track must ship on by default or the surface opens blank.
      const frozenKeys = new Set(columns.filter(isStructural).map((c) => c.key));
      const factCore = coreKeys(columns).filter((k) => !frozenKeys.has(k));
      assert.ok(factCore.length > 0, `${name} has no core fact columns — it would open blank`);
    }
  });
});
