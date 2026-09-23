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
import { DAILY_COMPOUND_COLUMNS } from '@/features/home/grid/daily-table-definition';
import { DAILY_FAMILY } from '@/lib/tables/field-catalog/daily';
import { TASKS_COMPOUND_COLUMNS } from '@/features/tasks/grid/tasks-table-definition';
import { TASKS_FAMILY } from '@/lib/tables/field-catalog/tasks';
import { isSlotTableColumnSortable } from '@/components/tables/compound/slot-table-columns';
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
  SLOT_TABLE_COLUMN_ENGINE_FAMILIES,
  SLOT_TABLE_COLUMN_MODULE_DEBT,
  SLOT_TABLE_GRAPH_SYMBOL_FILES,
  SLOT_TABLE_GRID_ROW_ALLOWLIST,
  SLOT_TABLE_PAINT_LAW,
  STAFF_COMBOBOX_HOSTS,
  slotTableEngineContractSource,
  slotTableEnginePeerIds,
  slotTableGraphSymbolFile,
  slotTablePeerIds,
} from './slot-table-cohort';
import {
  slotTableColumnsFor,
  slotTableSortFactFor,
} from '@/components/tables/compound/slot-table-columns';
import { LOCATION_STOCK_FAMILY } from '@/lib/tables/field-catalog/location-stock';
import { SKU_BINS_FAMILY } from '@/lib/tables/field-catalog/sku-bins';
import { SLOT_TABLE_ID_HEADER_WORD } from '@/lib/tables/slot-table-id-header-law';

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

  it('no new *-grid-layout.ts — the column law is the engine, not a family copy', () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git' || name === '.next') continue;
        const abs = join(dir, name);
        if (statSync(abs).isDirectory()) walk(abs);
        else if (name.endsWith('-grid-layout.ts')) {
          found.push(relative(ROOT, abs).replaceAll('\\', '/'));
        }
      }
    };
    walk(join(ROOT, 'src'));
    const allowed = new Set<string>(SLOT_TABLE_COLUMN_MODULE_DEBT);
    const extra = found.filter((p) => !allowed.has(p)).sort();
    const missing = [...allowed].filter((p) => !found.includes(p)).sort();
    assert.deepEqual(
      extra,
      [],
      `A new *-grid-layout.ts re-declares the engine's column law. Write a SlotTableFamily record (src/lib/tables/slot-table-family.ts) and mount slotTableColumnsFor instead. Added:\n${extra.join('\n')}`,
    );
    assert.deepEqual(
      missing,
      [],
      `SLOT_TABLE_COLUMN_MODULE_DEBT is shrink-only. Remove these ported paths:\n${missing.join('\n')}`,
    );
  });

  it('the engine families own no column module and paint from their record', () => {
    for (const family of [LOCATION_STOCK_FAMILY, SKU_BINS_FAMILY]) {
      assert.ok(
        SLOT_TABLE_COLUMN_ENGINE_FAMILIES.includes(
          family.tableId as (typeof SLOT_TABLE_COLUMN_ENGINE_FAMILIES)[number],
        ),
        `${family.tableId} must be listed as an engine-painted family`,
      );
      // DESCRIPTOR_CARRIES_DATA_NOT_BEHAVIOR: a closure here is the fork.
      for (const [key, value] of Object.entries(family)) {
        assert.notEqual(typeof value, 'function', `${family.tableId}.${key} is behavior, not data`);
      }
      const columns = slotTableColumnsFor(family, family.productLayout);
      for (const chrome of COMPOUND_COLUMN_KEYS) {
        assert.ok(
          columns.some((c) => c.key === chrome),
          `${family.tableId}: skeleton track ${chrome} was cut`,
        );
      }
      // Every painted DATA header sorts; structural chrome never does.
      for (const col of columns) {
        const fact = slotTableSortFactFor(family, col);
        if (isSlotTableChromeTrack(col.key)) {
          assert.equal(fact, null, `${family.tableId}: ${col.key} is chrome and must not sort`);
        } else {
          assert.ok(fact, `${family.tableId}: ${col.key} paints a fact with a dead header`);
        }
      }
      // A DATA chrome header's WORD and its SORT come from the same catalog
      // field. The IDENTITY track is the exception and has its own law: the
      // word is `Id` on every peer (`slot-table-id-header-law.test.ts`), the
      // fact is still the family's.
      const identityCol = columns.find((c) => c.key === 'fulfillment');
      if (identityCol) {
        assert.equal(
          identityCol.gridLabel,
          SLOT_TABLE_ID_HEADER_WORD,
          `${family.tableId}: the identity header is the engine's word`,
        );
        assert.ok(
          slotTableSortFactFor(family, identityCol),
          `${family.tableId}: the identity header sorts nothing`,
        );
      }
      for (const key of ['item', 'dates', 'state'] as const) {
        const col = columns.find((c) => c.key === key);
        if (!col) continue;
        const fact = slotTableSortFactFor(family, col);
        const field = family.catalog.find((f) => f.id === fact);
        assert.ok(field, `${family.tableId}: ${key} sorts by a fact outside its catalog`);
        assert.equal(
          col.gridLabel,
          family.chrome?.[key]?.gridLabel ?? family.chrome?.[key]?.label ?? field.label,
          `${family.tableId}: ${key} header drifted from the fact it sorts`,
        );
      }
    }
  });

  it('To-ship Google Sheet sync paints UnshippedTable, not CsvImportStagingGridRow', () => {
    const desk = read('src/components/dashboard/DashboardOrdersView.tsx');
    assert.match(desk, /UnshippedTable/);
    assert.match(desk, /CsvImportStagingHost/);
    assert.doesNotMatch(
      desk,
      /from ['"]@\/components\/outbound\/orders\/import-staging\/CsvImportStagingGridRow['"]/,
    );

    const sync = read('src/hooks/useOrdersSync.ts');
    assert.doesNotMatch(
      sync,
      /setStagingActive\(true\)/,
      'sheet sync must not set ?import=csv (that swaps in the staging fork)',
    );
    assert.match(
      read('src/components/unshipped/useToShipChrome.ts'),
      /applyToShipTriageFacet/,
      'To-ship chrome owns the sheet-triage facet — not a second table',
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
      'header-sort law forbids a parent sort freeze on the outbound DataTable',
    );
    assert.doesNotMatch(
      read('src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx'),
      /sort\s*[:=]\s*["'](?:newest|deadline)["']/,
      'outbound spreadsheet must not freeze newest/deadline — useQueueDisplaySort is the SoT',
    );
    for (const host of [
      'src/components/shipped/DashboardShippedTable.tsx',
      'src/components/outbound/scan-out/StagedQueueTable.tsx',
      'src/features/review/ReviewPackingTable.tsx',
      'src/features/review/pairing/ReviewPairingTable.tsx',
      'src/components/outbound/orders/OrderImportRecordsHost.tsx',
    ]) {
      if (!existsSync(join(ROOT, host))) continue;
      const src = read(host);
      assert.doesNotMatch(
        src,
        /sort\s*[:=]\s*["'](?:newest|deadline)["']/,
        `${host} must not freeze DataTable sort (useQueueDisplaySort is the SoT)`,
      );
      assert.match(
        src,
        /useOrdersSpreadsheet/,
        `${host} mounts the same outbound spreadsheet as To-ship`,
      );
    }
    const exceptionsSrc = read(
      'src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx',
    );
    assert.doesNotMatch(
      exceptionsSrc,
      /actions=\{/,
      'exceptions Paste / Resolve must not fork DataTable toolbar actions',
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
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /SLOT_TABLE_OVERLAY_HOST_ATTR/,
      'Morphing portals into the slot-table overlay host, not a left popover',
    );
    assert.doesNotMatch(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /placement=["']left-start["']/,
      'Morphing must not park beside the row',
    );
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /morphing-row-more-actions/,
      'overflow ⋮ is required on the sticky action row',
    );
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /morphing-row-delete/,
      'Delete stays isolated on the far right',
    );
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /notes-view/,
      'desktop Notes morphs the action row into a one-row composer',
    );
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /variant=["']strip["']/,
      'desktop Notes mounts OrderNotesTrail strip, not the dock trail',
    );
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /isMorphingMobileUrl/,
      'BottomSheet Notes is gated to a mobile URL',
    );
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /forceVariant=["']sheet["']/,
      'mobile-URL Notes still opens a bottom chip sheet',
    );
    assert.match(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /variant=["']compact["']/,
      'mobile-URL Notes sheet mounts OrderNotesTrail compact, not the dock trail',
    );
    assert.match(
      SLOT_TABLE_PAINT_LAW.ordersActions,
      /notes-view/,
      'paint law pins desktop Notes to the one-row composer',
    );
    assert.match(
      SLOT_TABLE_PAINT_LAW.ordersActions,
      /isMorphingMobileUrl/,
      'paint law pins the BottomSheet to /m/ URLs',
    );
    assert.match(
      SLOT_TABLE_PAINT_LAW.ordersActions,
      /forceVariant="sheet"/,
      'paint law still names the mobile chip sheet',
    );
    assert.match(
      read('src/components/tables/DataTable.tsx'),
      /SLOT_TABLE_OVERLAY_HOST_ATTR/,
      'DataTable stamps the overlay host on the grid shell',
    );
    assert.match(
      read(SLOT_TABLE_ENGINE.ledgerGrid),
      SLOT_TABLE_ENGINE_CONTRACT.headerActionRow,
      'LedgerGrid stamps the action row under the column header',
    );
    assert.match(
      read(SLOT_TABLE_ENGINE.ledgerGrid),
      SLOT_TABLE_ENGINE_CONTRACT.headerActionRowGuest,
      'action row is an empty:hidden in-flow guest — not occupancy on the labels',
    );
    assert.doesNotMatch(
      read(SLOT_TABLE_ENGINE.ledgerGrid),
      /data-slot-table-action-row[\s\S]{0,120}absolute inset-0/,
      'action row must not occupy the column-header plate',
    );
    assert.match(SLOT_TABLE_PAINT_LAW.ordersActions, /commitExceptionsItemPaste/);
    assert.match(
      SLOT_TABLE_PAINT_LAW.ordersActions,
      /BELOW the column header/,
      'Morphing sits under the headers, not on them',
    );
    assert.match(
      SLOT_TABLE_PAINT_LAW.ordersActions,
      /Click-off to either side does not dismiss/,
      'selection keeps the bar; click-off does not',
    );
    assert.match(
      read('src/design-system/components/grid/LedgerGrid.tsx'),
      /data-slot-table-prefix/,
      'prefix still pins with the column header, not inside the body port',
    );
    assert.doesNotMatch(
      read('src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
      /document\.addEventListener\(['"]mousedown['"]/,
      'click-off must not dismiss Morphing while a row is selected',
    );
    const queueRowSrc = read('src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx');
    assert.match(
      queueRowSrc,
      /morphingEnabled = compoundLayout && Boolean\(onToggleSelect\)/,
      'Morphing must not gate on queueMode === fulfillment',
    );
    assert.doesNotMatch(
      queueRowSrc,
      /<MorphingRowActionMenu/,
      'desktop Morphing must not mount on a virtualized row',
    );
    assert.match(
      read('src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx'),
      /OrdersMorphingHost/,
      'desktop Morphing lives on the spreadsheet prefix, outside the row window',
    );
    assert.doesNotMatch(
      queueRowSrc,
      /enabled=\{queueMode === ['"]fulfillment['"]\}/,
      'mobile MorphingSelectGutter must stay armed on Shipped',
    );
    assert.match(
      read('src/components/shipped/DashboardShippedTable.tsx'),
      /<DataTable/,
      'Shipped page mounts DataTable, the same engine as To-ship',
    );
    assert.match(SLOT_TABLE_PAINT_LAW.stageAssign, /StageStaffAssignPopover/);
    assert.match(SLOT_TABLE_PAINT_LAW.stageAssign, /CompoundRow/);
    assert.match(SLOT_TABLE_PAINT_LAW.stageAssign, /All staff/);
    assert.match(SLOT_TABLE_PAINT_LAW.staffCombo, /AssigneeCombobox/);
    assert.match(SLOT_TABLE_PAINT_LAW.staffCombo, /StaffAvatar/);
    assert.match(SLOT_TABLE_PAINT_LAW.staffCombo, /SearchableSelectField/);
    for (const host of STAFF_COMBOBOX_HOSTS) {
      const src = read(host);
      assert.match(src, /StageStaffAssignPopover/, `${host} must mount StageStaffAssignPopover`);
      assert.doesNotMatch(
        src,
        /SearchableSelectField/,
        `${host} must not pick staff with SearchableSelectField`,
      );
    }
    assert.match(SLOT_TABLE_PAINT_LAW.lineQty, /CompoundItem/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineQty, /ensureLineQtySubtitle/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineQty, /\{family\}\.qty/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineQty, /PRODUCT_TABLES/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /gridLabel stays Dates|header stays Dates/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /Due date/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /Start date/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /startedHover/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /never prefix Order date|never.*Order date/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /faceLabel/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /never leave `--`/);
    assert.match(SLOT_TABLE_PAINT_LAW.dates, /Dwell/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineMoney, /CompoundItem/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineMoney, /ensureLineMoneySubtitle/);
    assert.match(SLOT_TABLE_PAINT_LAW.lineMoney, /COMPOUND_COLUMN_KEYS has no amount/);
    assert.match(SLOT_TABLE_PAINT_LAW.ordersActions, /COMPOUND_COLUMN_KEYS/);
    assert.match(SLOT_TABLE_PAINT_LAW.ordersActions, /ordersCompoundColumnsFor/);
    assert.match(SLOT_TABLE_PAINT_LAW.ordersActions, /CompoundFulfillment/);
    // Callers: pnpm run eval:cohort slot-table. API: paint-law assertions for
    // leaf detail disclosure. Schema: none. User: "Implement the plan as
    // specified… Do NOT edit the plan file itself."
    assert.match(SLOT_TABLE_PAINT_LAW.groupParentSelect, /COMPOUND_GUTTER_CHEVRON_BAND_CLASS/);
    assert.match(SLOT_TABLE_PAINT_LAW.groupParentSelect, /SlotTableGroupParentRow/);
    // 2026-09-15, second ruling: the 2026-09-04 top pin STANDS — the checklist
    // icon is pinned to the top of the gutter and the chevron sits below it in
    // its own band. Only the HORIZONTAL rail inset came from "centered in the
    // middle". The law must say the current rule, not the reverted one.
    assert.match(SLOT_TABLE_PAINT_LAW.groupParentSelect, /COMPOUND_GUTTER_MARK_TOP_PIN_CLASS/);
    assert.match(SLOT_TABLE_PAINT_LAW.groupParentSelect, /hover-ONLY in every state/);
    assert.match(SLOT_TABLE_PAINT_LAW.groupParentSelect, /resolveRowStatus\(row, queueMode\)/);
    assert.match(SLOT_TABLE_PAINT_LAW.selectGutterStatus, /COMPOUND_GUTTER_RAIL_INSET_CLASS/);
    assert.match(SLOT_TABLE_PAINT_LAW.leafDetailSelect, /data-row-detail/);
    assert.match(SLOT_TABLE_PAINT_LAW.leafDetailSelect, /COMPOUND_GUTTER_CHEVRON_BAND_CLASS/);
    assert.match(SLOT_TABLE_PAINT_LAW.leafDetailSelect, /group CHILD rows included/);
    assert.match(SLOT_TABLE_PAINT_LAW.leafDetailSelect, /compoundRowDetailEstimatePx/);
    assert.match(SLOT_TABLE_PAINT_LAW.leafDetailSelect, /BottomSheet/);
    assert.match(SLOT_TABLE_PAINT_LAW.personFace, /StaffAvatar/);
    assert.match(SLOT_TABLE_PAINT_LAW.personFace, /kind:person/);
    assert.match(SLOT_TABLE_PAINT_LAW.personFace, /Never Staff #id/);
    assert.match(SLOT_TABLE_PAINT_LAW.personFace, /PRODUCT_TABLES/);
    assert.match(
      read(SLOT_TABLE_ENGINE.compoundRow),
      SLOT_TABLE_ENGINE_CONTRACT.compoundRowForwardsStageAssigns,
    );
  });

  it('person face never paints Staff #id — engine + resolvers', () => {
    assert.match(
      read('src/components/tables/compound/CompoundCells.tsx'),
      /displayType === ['"]person['"]/,
      'CompoundSlotCell must branch on person displayType',
    );
    assert.match(
      read('src/components/tables/compound/CompoundCells.tsx'),
      /StaffAvatar/,
      'person face mounts StaffAvatar',
    );
    assert.doesNotMatch(
      read('src/lib/tables/field-catalog/kiosk-devices-resolve.ts'),
      /Staff #\$\{|`Staff #|text:\s*[`'"]Staff #/,
      'kiosk enrolled_by must never hard-code a Staff #id face string',
    );
    assert.match(
      read('src/lib/tables/field-catalog/kiosk-devices-resolve.ts'),
      /kind:\s*['"]person['"]/,
      'kiosk enrolled_by resolves kind:person',
    );
    assert.match(
      read('src/lib/tables/field-catalog/tracking-exceptions-resolve.ts'),
      /kind:\s*['"]person['"]/,
      'tracking-exceptions.staff resolves kind:person',
    );
    assert.match(
      read('src/lib/auth/kiosk-device.ts'),
      /LEFT JOIN staff/,
      'listKioskDevices joins staff.name for enrolled_by',
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
    for (const name of ['queueSortForColumnKey', 'LedgerGridColumnHeader', 'isSlotTableChromeTrack', 'MorphingRowActionMenu']) {
      assert.ok(symbols.includes(name), `graphSymbols missing ${name}`);
    }
    assert.ok(
      SLOT_TABLE_ENGINE.critiqueFiles.includes(SLOT_TABLE_ENGINE.ledgerGridColumnHeader),
      'critiqueFiles must include LedgerGridColumnHeader',
    );
    assert.ok(
      SLOT_TABLE_ENGINE.critiqueFiles.includes(SLOT_TABLE_ENGINE.morphingRowActionMenu),
      'critiqueFiles must include MorphingRowActionMenu',
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
  it('orders / receiving / incoming / tasks / daily / review default mounts', () => {
    const families: Array<[string, readonly { key: string; fieldId?: string }[], (key: string, fieldId?: string | null) => boolean]> = [
      ['orders', ORDERS_COMPOUND_COLUMNS, isQueueSortableColumnKey],
      ['receiving', RECEIVING_COMPOUND_COLUMNS, isReceivingGridSortable],
      ['incoming', INCOMING_COMPOUND_COLUMNS, isIncomingGridSortable],
      [
        'tasks',
        TASKS_COMPOUND_COLUMNS,
        (key) => isSlotTableColumnSortable(TASKS_FAMILY, TASKS_COMPOUND_COLUMNS, key),
      ],
      [
        'daily',
        DAILY_COMPOUND_COLUMNS,
        (key) => isSlotTableColumnSortable(DAILY_FAMILY, DAILY_COMPOUND_COLUMNS, key),
      ],
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

