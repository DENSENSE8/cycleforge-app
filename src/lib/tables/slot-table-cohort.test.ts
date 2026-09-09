/**
 * Tripwire — slot-table cohort (engine + PRODUCT_TABLES).
 *
 * Run: node --import tsx --test src/lib/tables/slot-table-cohort.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { PRODUCT_TABLES } from '@/lib/tables/table-catalog';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import { ORDERS_COMPOUND_COLUMNS } from '@/lib/dashboard-order-row-layout';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isQueueSortableColumnKey } from '@/utils/queue-display-sort';
import {
  INCOMING_COMPOUND_COLUMNS,
  RECEIVING_COMPOUND_COLUMNS,
  isIncomingGridSortable,
  isReceivingGridSortable,
} from '@/lib/receiving/receiving-grid-layout';
import { DAILY_COMPOUND_COLUMNS, isDailyGridSortable } from '@/lib/daily-checks/daily-grid-layout';
import { TASKS_COMPOUND_COLUMNS, isTasksGridSortable } from '@/lib/staff-todos/tasks-grid-layout';
import {
  SESSIONS_COMPOUND_COLUMNS,
  isSessionsGridSortable,
} from '@/lib/sessions/sessions-grid-layout';
import {
  SKU_VELOCITY_COMPOUND_COLUMNS,
  isSkuVelocityGridSortable,
} from '@/lib/reports/sku-velocity-grid-layout';
import {
  DEAD_STOCK_COMPOUND_COLUMNS,
  isDeadStockGridSortable,
} from '@/lib/reports/dead-stock-grid-layout';
import {
  CATALOG_LINK_COMPOUND_COLUMNS,
  isCatalogLinkGridSortable,
} from '@/features/review/catalog-link/grid/catalog-link-grid-layout';
import {
  IMPORT_EXCEPTION_COMPOUND_COLUMNS,
  isImportExceptionGridSortable,
} from '@/features/review/catalog-link/grid/import-exception-grid-layout';
import {
  SLOT_TABLE_ENGINE,
  SLOT_TABLE_ENGINE_CONTRACT,
  SLOT_TABLE_ENGINE_LAYOUT_HOOKS,
  SLOT_TABLE_GRAPH_SYMBOL_FILES,
  SLOT_TABLE_GRID_ROW_ALLOWLIST,
  SLOT_TABLE_PAINT_LAW,
  slotTableEngineContractSource,
  slotTableEnginePeerIds,
  slotTableGraphSymbolFile,
  slotTablePeerIds,
} from './slot-table-cohort';

const ROOT = join(process.cwd());

function read(rel: string): string {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `missing ${rel}`);
  return readFileSync(abs, 'utf8');
}

describe('slot-table cohort (SoT = engine + PRODUCT_TABLES)', () => {
  it('peers are exactly PRODUCT_TABLES ids (no hand list)', () => {
    assert.deepEqual(
      slotTablePeerIds(),
      PRODUCT_TABLES.map((t) => t.tableId),
    );
    assert.ok(slotTablePeerIds().includes('orders'));
    assert.ok(slotTablePeerIds().length >= 15);
  });

  it('every engine layout hook file exists and imports useSlotTableLayout', () => {
    for (const hook of SLOT_TABLE_ENGINE_LAYOUT_HOOKS) {
      const src = read(hook.path);
      assert.match(
        src,
        /useSlotTableLayout/,
        `${hook.tableId}: ${hook.path} must wrap useSlotTableLayout`,
      );
      assert.ok(
        slotTablePeerIds().includes(hook.tableId),
        `${hook.tableId} must be a PRODUCT_TABLES peer`,
      );
    }
  });

  it('engine peers are a subset of PRODUCT_TABLES (opt-in map)', () => {
    const peers = new Set(slotTablePeerIds());
    for (const id of slotTableEnginePeerIds()) {
      assert.ok(peers.has(id), `engine peer ${id} missing from PRODUCT_TABLES`);
    }
  });

  it('CompoundItem title hover actions satisfy paint contract', () => {
    const src = read(SLOT_TABLE_ENGINE.compoundCells);
    const titleSrc = read(SLOT_TABLE_ENGINE.productTitleLink);
    for (const [name, re] of Object.entries(SLOT_TABLE_ENGINE_CONTRACT)) {
      const rel = slotTableEngineContractSource(name as keyof typeof SLOT_TABLE_ENGINE_CONTRACT);
      if (rel !== SLOT_TABLE_ENGINE.compoundCells && rel !== SLOT_TABLE_ENGINE.productTitleLink) {
        continue;
      }
      assert.match(read(rel), re, `${rel} missing ${name}`);
    }
    assert.doesNotMatch(
      titleSrc,
      /className=\{cn\(\s*'min-w-0 truncate text-text-info(?!\s+hover)/,
      'title must not be standing text-text-info without idle default',
    );
    assert.doesNotMatch(src, /function CompoundShipByEditor/, 'hand-rolled ship-by editor is gone');
    assert.doesNotMatch(src, /type=["']date["']/, 'no native date input on the compound engine');
    assert.doesNotMatch(
      src,
      /<InlineEditableValue[\s/>]/,
      'dates are DateRangePickerField, not InlineEditableValue',
    );
  });

  it('no new *GridRow.tsx — To-ship sheet sync must not add a second table', () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git' || name === '.next') continue;
        const abs = join(dir, name);
        const st = statSync(abs);
        if (st.isDirectory()) walk(abs);
        else if (name.endsWith('GridRow.tsx')) {
          found.push(relative(ROOT, abs).replaceAll('\\', '/'));
        }
      }
    };
    walk(join(ROOT, 'src'));
    const allowed = new Set<string>(SLOT_TABLE_GRID_ROW_ALLOWLIST);
    const extra = found.filter((p) => !allowed.has(p)).sort();
    const missing = [...allowed].filter((p) => !found.includes(p)).sort();
    assert.deepEqual(
      extra,
      [],
      `New *GridRow.tsx is a second table. Mount UnshippedTable / the family spreadsheet hook. Added:\n${extra.join('\n')}`,
    );
    assert.deepEqual(
      missing,
      [],
      `GridRow allowlist is shrink-only. Remove these gone paths from SLOT_TABLE_GRID_ROW_ALLOWLIST:\n${missing.join('\n')}`,
    );
  });

  it('To-ship Google Sheet sync paints UnshippedTable, not CsvImportStagingGridRow', () => {
    const desk = read('src/components/dashboard/DashboardOrdersView.tsx');
    assert.match(desk, /UnshippedTable/);
    assert.match(desk, /SHEET_TRIAGE_ORIGIN/);
    assert.match(
      desk,
      /origin !== SHEET_TRIAGE_ORIGIN/,
      'google_sheets origin must stay on UnshippedTable',
    );
    assert.doesNotMatch(
      desk,
      /from ['"]@\/components\/outbound\/orders\/import-staging\/CsvImportStagingGridRow['"]/,
    );

    const sync = read('src/hooks/useOrdersSync.ts');
    assert.match(sync, /applyToShipTriageFacet/);
    assert.doesNotMatch(
      sync,
      /setStagingActive\(true\)/,
      'sheet sync must not set ?import=csv (that swaps in the staging fork)',
    );
  });

  it('engine seam files export the shared hooks (imported, not grepped)', async () => {
    // X1: an import IS the existence proof — a rename that keeps the seam passes, one that breaks it fails to load.
    const layout = await import('@/components/tables/useSlotTableLayout');
    assert.equal(typeof layout.useSlotTableLayout, 'function');
    const tracks = await import('@/lib/tables/materialize-tracks');
    assert.equal(typeof tracks.materializeTracks, 'function');
    const sortLaw = await import('@/lib/tables/slot-table-header-sort');
    assert.equal(typeof sortLaw.isSlotTableChromeTrack, 'function');
    assert.equal(sortLaw.isSlotTableChromeTrack('select'), true);
    assert.equal(sortLaw.isSlotTableChromeTrack('thumb'), true);
  });

  it('compact DateRangePickerField is the ship-by surface', () => {
    const src = read(SLOT_TABLE_ENGINE.dateRangePickerField);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.dateFieldCompactDecl);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.dateFieldNoYearFace);
    assert.match(src, /variant === ['"]compact['"]/);
  });

  it('ship-by writes through useOptimisticMutation', () => {
    assert.match(read(SLOT_TABLE_ENGINE.useOrderAssignment), SLOT_TABLE_ENGINE_CONTRACT.assignOptimistic);
  });

  it('paint law constants document cohort scope (not To-ship alone)', () => {
    assert.match(SLOT_TABLE_PAINT_LAW.scope, /PRODUCT_TABLES/);
    assert.doesNotMatch(SLOT_TABLE_PAINT_LAW.scope, /^To-ship/);
    assert.match(SLOT_TABLE_PAINT_LAW.shipBy, /DateRangePickerField/);
    assert.match(SLOT_TABLE_PAINT_LAW.shipBy, /compact/);
    assert.match(SLOT_TABLE_PAINT_LAW.shipBy, /useOptimisticMutation/);
    assert.match(SLOT_TABLE_PAINT_LAW.filter, /DataTableFilterMenu/);
    assert.match(SLOT_TABLE_PAINT_LAW.filter, /DATA_TABLE_FILTER_IDLE/);
    assert.match(SLOT_TABLE_PAINT_LAW.filter, /actions/);
    assert.match(SLOT_TABLE_PAINT_LAW.headerSort, /click-to-sort/);
    assert.match(SLOT_TABLE_PAINT_LAW.headerSort, /_fill/);
    assert.match(SLOT_TABLE_PAINT_LAW.headerSort, /thumb/);
    assert.match(SLOT_TABLE_PAINT_LAW.headerSort, /queueColumnSortOptions/);
    assert.match(SLOT_TABLE_PAINT_LAW.headerSort, /Image type glyph/);
    assert.match(SLOT_TABLE_PAINT_LAW.headerSort, /tab mount/);
    assert.match(
      SLOT_TABLE_PAINT_LAW.headerSort,
      /frozen `sort=`/,
      'header-sort law forbids a parent sort freeze on OrdersGridHost',
    );
    assert.doesNotMatch(
      read('src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx'),
      /urlDriven/,
      'outbound sort is always ?sort= — a urlDriven gate is a dead-header fork',
    );
    for (const host of [
      'src/components/shipped/DashboardShippedTable.tsx',
      'src/components/outbound/scan-out/StagedQueueTable.tsx',
      'src/features/review/ReviewPackingTable.tsx',
      'src/features/review/pairing/ReviewPairingTable.tsx',
      'src/components/outbound/orders/OrderImportRecordsHost.tsx',
    ]) {
      assert.doesNotMatch(
        read(host),
        /sort\s*[:=]\s*["'](?:newest|deadline)["']/,
        `${host} must not freeze OrdersGridHost sort (useQueueDisplaySort is the SoT)`,
      );
    }
    const exceptionsSrc = read(
      'src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx',
    );
    assert.doesNotMatch(
      exceptionsSrc,
      /key !== ['"]thumb['"]/,
      'exceptions tab must not drop the Image gutter',
    );
    assert.doesNotMatch(
      exceptionsSrc,
      /actions=\{/,
      'exceptions Paste / Resolve must not fork DataTable toolbar actions',
    );
    assert.match(
      exceptionsSrc,
      /DeskHeaderAction/,
      'exceptions Resolve registers the desk-header primary',
    );
    assert.match(
      exceptionsSrc,
      /exceptions-open-form/,
      'exceptions Resolve keeps the e2e CTA testid',
    );
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /commitExceptionsItemPaste/,
      'exceptions Paste item # commits from the row Morphing menu',
    );
    assert.match(SLOT_TABLE_PAINT_LAW.ordersActions, /commitExceptionsItemPaste/);
    assert.match(
      SLOT_TABLE_PAINT_LAW.ordersActions,
      /To-ship AND Shipped/,
      'select-gutter Morphing is outbound-lane law, not To-ship-only',
    );
    const queueRowSrc = read('src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx');
    assert.match(
      queueRowSrc,
      /morphingEnabled = compoundLayout && Boolean\(onToggleSelect\)/,
      'Morphing must not gate on queueMode === fulfillment',
    );
    assert.doesNotMatch(
      queueRowSrc,
      /enabled=\{queueMode === ['"]fulfillment['"]\}/,
      'mobile MorphingSelectGutter must stay armed on Shipped',
    );
    assert.match(
      read('src/components/shipped/DashboardShippedTable.tsx'),
      /OrdersGridHost/,
      'Shipped page mounts the same outbound host as To-ship',
    );
    assert.match(SLOT_TABLE_PAINT_LAW.stageAssign, /StageStaffAssignPopover/);
    assert.match(SLOT_TABLE_PAINT_LAW.stageAssign, /CompoundRow/);
    assert.match(SLOT_TABLE_PAINT_LAW.stageAssign, /All staff/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineQty, /CompoundItem/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineQty, /ensureLineQtySubtitle/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineQty, /\{family\}\.qty/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineQty, /PRODUCT_TABLES/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /gridLabel stays Dates|header stays Dates/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /Due date/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineMoney, /CompoundItem/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineMoney, /ensureLineMoneySubtitle/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineMoney, /COMPOUND_COLUMN_KEYS has no amount/);
    assert.match(SLOT_TABLE_PAINT_LAW.ordersActions, /COMPOUND_COLUMN_KEYS/);
    assert.match(SLOT_TABLE_PAINT_LAW.ordersActions, /ordersCompoundColumnsFor/);
    assert.match(SLOT_TABLE_PAINT_LAW.ordersActions, /CompoundFulfillment/);
    assert.match(
      read(SLOT_TABLE_ENGINE.compoundRow),
      SLOT_TABLE_ENGINE_CONTRACT.compoundRowForwardsStageAssigns,
    );
  });

  it('graph + critique surfaces include compact ship-by', () => {
    const symbols = SLOT_TABLE_ENGINE.graphSymbols as readonly string[];
    for (const name of ['CompoundState', 'DateRangePickerField', 'useOptimisticMutation']) {
      assert.ok(symbols.includes(name), `graphSymbols missing ${name}`);
    }
    assert.ok(
      SLOT_TABLE_ENGINE.critiqueFiles.includes(SLOT_TABLE_ENGINE.dateRangePickerField),
      'critiqueFiles must include DateRangePickerField',
    );
  });

  it('DataTable always mounts the filter funnel', () => {
    const src = read(SLOT_TABLE_ENGINE.dataTable);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.filterMenuAlwaysMounted);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.filterIdleChrome);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.toolbarActionsLeft);
    const filterAt = src.indexOf('<DataTableFilterMenu {...filterChrome}');
    const actionsAt = src.indexOf('<DataTableToolbarActions');
    const mlAutoAt = src.indexOf('ml-auto inline-flex');
    assert.ok(
      filterAt >= 0 && actionsAt > filterAt && actionsAt < mlAutoAt,
      'job verbs must paint left of the drawing cluster, after filter',
    );
    assert.doesNotMatch(
      src,
      /\{filter \? <DataTableFilterMenu/,
      'filter icon must not be optional chrome',
    );
    const symbols = SLOT_TABLE_ENGINE.graphSymbols as readonly string[];
    assert.ok(symbols.includes('DataTableFilterMenu'), 'graphSymbols missing DataTableFilterMenu');
    assert.ok(
      SLOT_TABLE_ENGINE.critiqueFiles.includes(SLOT_TABLE_ENGINE.dataTable),
      'critiqueFiles must include DataTable',
    );
    assert.equal(slotTableGraphSymbolFile('DataTableFilterMenu'), SLOT_TABLE_ENGINE.dataTable);
  });

  it('shared skeleton has no ⋮ and no Amount track (copy on chips, money under the title)', () => {
    assert.ok(!(COMPOUND_COLUMN_KEYS as readonly string[]).includes('actions'));
    assert.ok(!(COMPOUND_COLUMN_KEYS as readonly string[]).includes('amount'));
    assert.ok(!ORDERS_COMPOUND_COLUMNS.some((c) => c.key === 'actions'));
    assert.ok(!ORDERS_COMPOUND_COLUMNS.some((c) => c.key === 'amount'));
    assert.match(
      read(SLOT_TABLE_ENGINE.compoundColumns),
      SLOT_TABLE_ENGINE_CONTRACT.compoundSkeletonNoActions,
    );
    assert.match(
      read(SLOT_TABLE_ENGINE.compoundColumns),
      SLOT_TABLE_ENGINE_CONTRACT.compoundSkeletonNoAmount,
    );
    assert.match(read(SLOT_TABLE_ENGINE.lineMoney), SLOT_TABLE_ENGINE_CONTRACT.lineMoneyEnsure);
    const row = read(SLOT_TABLE_ENGINE.ordersQueueRow);
    assert.doesNotMatch(row, /Copy order number/);
    assert.doesNotMatch(row, /rowMenuActions/);
    const symbols = SLOT_TABLE_ENGINE.graphSymbols as readonly string[];
    assert.ok(symbols.includes('ordersCompoundColumnsFor'));
    assert.ok(symbols.includes('ensureLineMoneySubtitle'));
    assert.ok(symbols.includes('pinLineMoneyAfterQty'));
    assert.equal(slotTableGraphSymbolFile('ordersCompoundColumnsFor'), SLOT_TABLE_ENGINE.ordersLayout);
    assert.equal(slotTableGraphSymbolFile('ensureLineMoneySubtitle'), SLOT_TABLE_ENGINE.lineMoney);
  });

  it('every graphSymbol maps to an existing KEEP engine file', () => {
    for (const name of SLOT_TABLE_ENGINE.graphSymbols) {
      const rel = slotTableGraphSymbolFile(name);
      assert.equal(SLOT_TABLE_GRAPH_SYMBOL_FILES[name], rel);
      const src = read(rel);
      assert.match(src, new RegExp(name), `${rel} must declare ${name}`);
    }
  });

  it('header click-to-sort is engine law (chrome only; every data track sorts)', async () => {
    // `headerClickUsesIsSortable` was a grep on LedgerGridColumnHeader.tsx; it
    // retired 2026-09-02 (D7 item 14, receipt grep_to_test) in favour of the
    // mounted click test src/design-system/components/grid/LedgerGridColumnHeader.test.ts.
    // Track → sort fact mapping, asserted by calling it (was three greps on the source).
    const { queueSortForColumnKey, queueColumnSortOptions } = await import('@/utils/queue-display-sort');
    assert.equal(queueSortForColumnKey('thumb'), null);
    assert.equal(queueSortForColumnKey('state'), 'status');
    assert.equal(queueSortForColumnKey('amount'), 'amount');
    assert.equal(typeof queueColumnSortOptions, 'function');
    const ids = queueColumnSortOptions().map((o) => o.id);
    for (const fact of ['status', 'amount']) assert.ok(ids.includes(fact as never), `toolbar sort menu lists ${fact}`);
    assert.equal(ids.includes('image' as never), false);
    
    assert.match(
      read('src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx'),
      /queueColumnSortOptions\(\)/,
    );
    const symbols = SLOT_TABLE_ENGINE.graphSymbols as readonly string[];
    for (const name of ['queueSortForColumnKey', 'LedgerGridColumnHeader', 'isSlotTableChromeTrack']) {
      assert.ok(symbols.includes(name), `graphSymbols missing ${name}`);
    }
    assert.ok(
      SLOT_TABLE_ENGINE.critiqueFiles.includes(SLOT_TABLE_ENGINE.ledgerGridColumnHeader),
      'critiqueFiles must include LedgerGridColumnHeader',
    );
  });
});

function assertCompoundFamilyHeaderSort(
  family: string,
  columns: readonly { key: string; fieldId?: string }[],
  isSortable: (key: string, fieldId?: string | null) => boolean,
) {
  let dataTracks = 0;
  for (const col of columns) {
    const ok = isSortable(col.key, col.fieldId);
    if (isSlotTableChromeTrack(col.key)) {
      assert.equal(ok, false, `${family} chrome ${col.key} must not sort`);
    } else {
      assert.equal(ok, true, `${family} data track ${col.key} must click-sort`);
      dataTracks += 1;
    }
  }
  assert.ok(dataTracks > 0, `${family} has no data tracks`);
}

describe('slot-table header-sort law on compound PRODUCT_TABLES peers', () => {
  it('orders / receiving / incoming / tasks / daily / review / sessions / reports ranking default mounts', () => {
    const families: Array<[string, readonly { key: string; fieldId?: string }[], (key: string, fieldId?: string | null) => boolean]> = [
      ['orders', ORDERS_COMPOUND_COLUMNS, isQueueSortableColumnKey],
      ['receiving', RECEIVING_COMPOUND_COLUMNS, isReceivingGridSortable],
      ['incoming', INCOMING_COMPOUND_COLUMNS, isIncomingGridSortable],
      ['tasks', TASKS_COMPOUND_COLUMNS, (key) => isTasksGridSortable(TASKS_COMPOUND_COLUMNS, key)],
      ['daily', DAILY_COMPOUND_COLUMNS, (key) => isDailyGridSortable(DAILY_COMPOUND_COLUMNS, key)],
      ['sessions', SESSIONS_COMPOUND_COLUMNS, (key) => isSessionsGridSortable(SESSIONS_COMPOUND_COLUMNS, key)],
      ['sku-velocity', SKU_VELOCITY_COMPOUND_COLUMNS, (key) => isSkuVelocityGridSortable(SKU_VELOCITY_COMPOUND_COLUMNS, key)],
      ['dead-stock', DEAD_STOCK_COMPOUND_COLUMNS, (key) => isDeadStockGridSortable(DEAD_STOCK_COMPOUND_COLUMNS, key)],
    ];
    for (const [family, columns, isSortable] of families) {
      assert.ok(
        columns.some((c) => c.key === 'thumb'),
        `${family} must mount the Image photo gutter — tabs fork rows, not columns`,
      );
      assertCompoundFamilyHeaderSort(family, columns, isSortable);
    }
    assertCompoundFamilyHeaderSort('catalog-link', CATALOG_LINK_COMPOUND_COLUMNS, isCatalogLinkGridSortable);
    assert.ok(CATALOG_LINK_COMPOUND_COLUMNS.some((c) => c.key === 'thumb'));
    assertCompoundFamilyHeaderSort(
      'import-exception',
      IMPORT_EXCEPTION_COMPOUND_COLUMNS,
      isImportExceptionGridSortable,
    );
    assert.ok(IMPORT_EXCEPTION_COMPOUND_COLUMNS.some((c) => c.key === 'thumb'));
  });
});

