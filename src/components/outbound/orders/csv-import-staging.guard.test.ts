/**
 * CSV import staging on To-Ship — placement laws.
 *
 * - Chrome is the house find-only shape: Band 1 = identity + ONE primary CTA +
 *   a quiet exit; Band 3 = flex-1 find with the Ready / Action-required facet
 *   IN the field; `▦` is portal-or-nothing into the Band-3 controls slot.
 * - Nuance lives on the right rail (`DeskInspectorIndexShell` index→leaf), and
 *   the column mapping no longer takes over the middle.
 * - Selection / destructive verbs dock on `InspectorActionFloor`, never Band 1.
 * - Live-queue bulk verbs stay rail-owned (no page-bottom capsule).
 * - Add / `?new=true` hosts on the rail-less desk (`OutboundOrdersDesk`).
 * - The staging grid is the house Workbench spreadsheet (table definition
 *   registry + `NonlinearTableHost`), showing each row's REAL details with its
 *   triage state in its own column — never a hand-rolled `<table>`, and its
 *   mapped fields edit in place via `LedgerCellEditor`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CSV_IMPORT_STAGING_TABLE_DEFINITION } from './import-staging/csv-import-staging-table-definition';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('csv-import-staging placement', () => {
  it('OutboundOrdersDesk mounts NewOrderEntryOverlay for Pattern E Add host', () => {
    const desk = read('src/components/outbound/orders/OutboundOrdersDesk.tsx');
    assert.match(desk, /NewOrderEntryOverlay/);
    assert.match(desk, /showIntakeForm/);
  });

  it('OutboundSidebarPanel does not import or mount NewOrderEntryOverlay', () => {
    const sidebar = read('src/components/sidebar/OutboundSidebarPanel.tsx');
    assert.doesNotMatch(
      sidebar,
      /import\s+\{\s*NewOrderEntryOverlay\s*\}\s+from/,
    );
    assert.doesNotMatch(sidebar, /<NewOrderEntryOverlay\b/);
  });

  it('Band 1 is identity + ONE primary CTA + a quiet exit — never selection verbs', () => {
    const host = read('src/components/outbound/orders/CsvImportStagingHost.tsx');
    // House band, not a page-local toolbar.
    assert.match(host, /WorkbenchChromeHeader/);
    assert.match(host, /density="band"/);
    assert.match(host, /WorkbenchTrailingCluster/);
    assert.doesNotMatch(host, /QueueTableToolbar/);
    // The one primary CTA names the set it will actually write.
    assert.match(host, /Confirm \$\{confirmCount\} ready/);
    assert.match(host, /requestConfirm/);
    // Selection verbs belong to the selection plane (the rail's action floor).
    assert.doesNotMatch(host, /Discard \{?\$?\{?selection/i);
    assert.doesNotMatch(host, /Clear selection/);
    assert.doesNotMatch(host, /ContextualSelectionBar/);
  });

  it('Band 3 is find-only: the status facet rides IN the field, ▦ is portal-only', () => {
    const host = read('src/components/outbound/orders/CsvImportStagingHost.tsx');
    assert.match(host, /WorkbenchTriageBand/);
    assert.match(host, /TechRailSearchBar/);
    // Facets that narrow ROWS ride in the field (2026-08-08 refine ruling) —
    // never a chip band beside the file name.
    assert.match(host, /trailingSuffix=\{/);
    assert.match(host, /WorkbenchFilterPopover/);
    assert.match(host, /density="field"/);
    // The card-corner ▦ float was deleted 2026-08-08: portal or nothing.
    assert.match(host, /controlsSlotRef=\{setControlsEl\}/);
    assert.match(host, /columnTriggerPortalTarget=\{controlsEl\}/);
    // Show / Hide inspector — desk copy, never Station "Open displays".
    assert.match(host, /WorkbenchInspectorToggle/);
  });

  it('the column mapping is a RAIL leaf — it never takes over the middle', () => {
    const host = read('src/components/outbound/orders/CsvImportStagingHost.tsx');
    const rail = read('src/components/outbound/orders/CsvImportStagingRail.tsx');
    // The middle paints the sheet immediately; an unmapped required field shows
    // up as Action required in the `status` column, which says strictly more
    // than a full-screen form.
    assert.doesNotMatch(host, /MappingPanel/);
    assert.doesNotMatch(host, /showMapping/);
    assert.doesNotMatch(host, /Continue to staging/);
    assert.match(rail, /CSV_ORDER_CANONICAL_FIELDS/);
    assert.match(rail, /setTableImportMapping/);
    // …and the commit GATE survives the takeover's removal.
    const store = read('src/lib/tables/import/staging-store.ts');
    assert.match(store, /tableImportConfirmTargets/);
    const classify = read('src/lib/orders/csv-order-import.ts');
    assert.match(classify, /if \(!orderNumber\) missing\.push\('order_number'\)/);
  });

  it('the rail is DeskInspectorIndexShell index→leaf — never a page-local twin', () => {
    const rail = read('src/components/outbound/orders/CsvImportStagingRail.tsx');
    assert.match(rail, /DeskInspectorIndexShell/);
    assert.match(rail, /DeskRailChromeRow/);
    // `PaneHeaderTabs` / a horizontal topic plate as PRIMARY topic nav is the
    // retired grammar (`display/right-rail-inspector.md`). Match USAGE, not
    // prose — the docblock names what it must not mount.
    assert.doesNotMatch(rail, /<(PaneHeaderTabs|SectionTabsSlider)\b/);
    assert.doesNotMatch(rail, /import[\s\S]{0,200}\b(PaneHeaderTabs|SectionTabsSlider)\b[\s\S]{0,80}from/);
    // Selection + destructive verbs dock on the Macro floor.
    assert.match(rail, /InspectorActionFloor/);
    assert.match(rail, /InspectorFlushDelete/);
  });

  it('mapped fields edit in place — Sheets keys, and the derived state never does', () => {
    const row = read(
      'src/components/outbound/orders/import-staging/CsvImportStagingGridRow.tsx',
    );
    assert.match(row, /LedgerCellEditor/);
    // The Unfound recipe: Enter / F2 opens, a printable char replaces, Escape
    // blurs, and every handler stops the row's own click from also firing.
    assert.match(row, /e\.key === 'Enter' \|\| e\.key === 'F2'/);
    assert.match(row, /e\.key\.length === 1/);
    assert.match(row, /stopPropagation/);
    // A commit writes back through the mapping; triage state is derived on read.
    assert.match(row, /updateTableImportRow/);
    // `status` is COMPUTED — an editor on it would let an operator assert a
    // readiness the record does not have.
    assert.doesNotMatch(row, /status: '(order_number|sku|quantity)'/);
    const editable = row.match(/EDITABLE_FIELD_BY_COLUMN[\s\S]*?\};/)?.[0] ?? '';
    assert.ok(editable, 'the editable-track map must stay declared in one place');
    assert.doesNotMatch(editable, /\bstatus\b/);
    assert.doesNotMatch(editable, /\bselect\b/);
    // No mapped source header ⇒ nowhere to write ⇒ the cell stays read-only.
    assert.match(row, /const editable = Boolean\(field && mapping\[field\]\)/);

    const capabilities = read(
      'src/components/outbound/orders/import-staging/csv-import-staging-grid-descriptor.ts',
    );
    assert.match(capabilities, /inCellEdit: true/);
  });

  it('the entry point composes the shared seam control, not a local file input', () => {
    const pop = read('src/components/unshipped/OrdersSyncPopover.tsx');
    assert.match(pop, /TableImportFileButton/);
    assert.match(pop, /ORDER_IMPORT_DESCRIPTOR/);
    // Parse + arm + the `?import=` optimistic paint all live in the seam, so a
    // second desk mounting import never re-implements them.
    assert.doesNotMatch(pop, /loadTableImportDraftFromFile/);
    assert.doesNotMatch(pop, /useTableImportParam/);
    assert.doesNotMatch(pop, /type="file"/);

    const control = read('src/components/tables/import/TableImportFileButton.tsx');
    assert.match(control, /loadTableImportDraftFromFile/);
    assert.match(control, /useTableImportParam/);
    assert.match(control, /Import from CSV/);
  });

  it('Band 1 carries ONE data-in CTA — Import and Add share a control', () => {
    const actions = read('src/components/dashboard/OutboundOrderChromeActions.tsx');
    // Two solid pills side by side spent the band's whole trailing budget on
    // two spellings of "get orders into this queue".
    assert.match(actions, /<OrdersSyncPopover/);
    assert.match(actions, /onNewOrder=\{onNewOrder\}/);
    assert.doesNotMatch(actions, /<Button/);
    assert.doesNotMatch(actions, /Add<\/Button>/);

    // One quiet cube — a peer of the band's other cells, not a solid fill
    // competing with the lifecycle tabs. The verbs are named in WORDS as tabs
    // inside the panel, never as a row of separated glyphs.
    const pop = read('src/components/unshipped/OrdersSyncPopover.tsx');
    assert.match(pop, /WorkbenchChromeCubeMenu/);
    for (const label of ["label: 'Import'", "label: 'Add'", "label: 'Backfill'"]) {
      assert.ok(pop.includes(label), `the panel must carry a ${label} tab`);
    }
    // Add stays reachable by the SAME accessible name it had as a pill, so the
    // only thing that changed for an operator is the path to it.
    assert.match(pop, /ariaLabel="New order entry"/);
  });

  it('the To-Ship surface reads the seam, not an orders-only staging store', () => {
    for (const rel of [
      'src/components/outbound/orders/CsvImportStagingHost.tsx',
      'src/components/outbound/orders/CsvImportStagingRail.tsx',
      'src/components/dashboard/DashboardOrdersView.tsx',
    ]) {
      const source = read(rel);
      assert.match(source, /@\/lib\/tables\/import\/staging-store/, rel);
      assert.match(source, /ORDER_IMPORT_DESCRIPTOR/, rel);
      // The retired orders-only store + param hook are DELETED, not shadowed
      // (`pattern-evolution.md` → a retirement is not done until the old path
      // is deleted).
      assert.doesNotMatch(source, /csv-import-staging-store/, rel);
      assert.doesNotMatch(source, /useCsvImportStagingParam/, rel);
    }
  });

  it('DashboardOrdersView swaps middle to CsvImportStagingHost', () => {
    const view = read('src/components/dashboard/DashboardOrdersView.tsx');
    assert.match(view, /CsvImportStagingHost/);
    assert.match(view, /showCsvStaging/);
  });

  it('staging grid mounts the registry host — never a hand-rolled table', () => {
    const host = read('src/components/outbound/orders/CsvImportStagingHost.tsx');
    assert.match(host, /<NonlinearTableHost/);
    assert.match(host, /CSV_IMPORT_STAGING_TABLE_BINDING/);
    // A hand-rolled `<table>` for an ops collection is the banned surface the
    // registry exists to replace (`ui-design-system.md` → Always ban).
    assert.doesNotMatch(host, /<table\b/);
    assert.doesNotMatch(host, /<tbody\b/);
  });

  it('the staging definition carries the triage state AND the row details', () => {
    const byKey = new Map(
      CSV_IMPORT_STAGING_TABLE_DEFINITION.columns.map((c) => [c.key, c] as const),
    );

    // The triage state is its OWN column — never a dot in the identity cell.
    const status = byKey.get('status');
    assert.ok(status, 'staging must expose a `status` triage track');
    assert.equal(status?.type, 'tag');
    // Structural: a triage queue whose triage state can be hidden can lie about
    // why Confirm skipped a row.
    assert.equal(status?.hideKey, undefined);

    // The actual details an operator triages on, in the data table rows.
    for (const key of ['order', 'sku', 'qty', 'customer', 'tracking', 'platform']) {
      assert.ok(byKey.get(key), `staging must expose the \`${key}\` detail track`);
    }

    // Frozen identity pane = `select · order` (the row's unique handle).
    assert.deepEqual(
      CSV_IMPORT_STAGING_TABLE_DEFINITION.columns.filter((c) => c.frozen).map((c) => c.key),
      ['select', 'order'],
    );

    // Confirm acts on N rows — select-all must be a real capability.
    assert.equal(CSV_IMPORT_STAGING_TABLE_DEFINITION.capabilities.multiSelect, true);
  });

  it('staging select-all drives the store through one selection scope', () => {
    const host = read('src/components/outbound/orders/CsvImportStagingHost.tsx');
    assert.match(host, /emitSelection\(/);
    assert.match(host, /emitSelectionTotal\(/);
    assert.match(host, /onToggleAll\(/);
    const header = read(
      'src/components/outbound/orders/import-staging/CsvImportStagingGridColumnHeader.tsx',
    );
    assert.match(header, /makeLedgerGridColumnHeader/);
    assert.match(header, /selectMode: 'always'/);
  });

  it('staging rail uses non-modal DetailStackRailRegistrar', () => {
    const rail = read('src/components/outbound/orders/CsvImportStagingRail.tsx');
    assert.match(rail, /detail:order-import-staging/);
    assert.match(rail, /modal=\{false\}/);
  });
});
