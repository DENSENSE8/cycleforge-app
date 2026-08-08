/**
 * Cross-family guard for GridSurfaceCapabilities.
 *
 * Every Workbench spreadsheet declares its features on the descriptor. The
 * dangerous default would be "undefined means on" for triage wash — Catalog
 * and Receiving must never silently paint staff row colours. This guard pins
 * the opt-in map so a drive-by `rowTriageFlags: true` on a display/pick
 * surface is a reviewed edit.
 *
 * Two halves, and the second exists because the first was not enough:
 *
 *  1. **Declared bags** (below) — the hand-listed families, their flags pinned.
 *  2. **DISCOVERED mounts** (`ledger grid mounts`) — every file that actually
 *     mounts `LedgerGrid` / `LedgerGridSurface`, walked off disk. The hand list
 *     could only ever certify the surfaces someone remembered to add to it, and
 *     it had certified the tree as green while `StationListTable` (Tech/Packer
 *     history) and `FbaBoardTable` mounted the spreadsheet SoT with **no bag at
 *     all** — which is not "all features off", it is unclassified. That is how
 *     `OrdersQueueTableRow` came to resolve a Tech bench row's fill against
 *     `ORDERS_GRID_CAPABILITIES`: a capability arriving through a shared
 *     component instead of a surface declaration. A guard scoped to the list it
 *     is guarding proves only that the list exists.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GridSurfaceCapabilities } from '@/design-system/components/grid';
import { CATALOG_GRID_CAPABILITIES } from '@/components/products/catalog/catalog-grid/catalog-grid-descriptor';
import { ORDERS_GRID_CAPABILITIES } from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import { INCOMING_GRID_CAPABILITIES } from '@/components/station/incoming-grid/incoming-grid-descriptor';
import { RECEIVING_GRID_CAPABILITIES } from '@/components/station/receiving-grid/receiving-grid-descriptor';
import { REPAIR_GRID_CAPABILITIES } from '@/components/repair/repair-grid/repair-grid-descriptor';
import { PICKUP_GRID_CAPABILITIES } from '@/components/receiving/pickup/grid/pickup-grid-descriptor';
import { CATALOG_GRID_COLUMNS } from '@/lib/products/catalog-grid-layout';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { INCOMING_GRID_COLUMNS } from '@/lib/receiving/incoming-grid-layout';
import { ORDERS_QUEUE_COLUMNS } from '@/lib/dashboard-order-row-layout';
import { REPAIR_GRID_COLUMNS } from '@/lib/repair/repair-grid-layout';
import { PICKUP_GRID_COLUMNS } from '@/components/receiving/pickup/grid/pickup-grid-layout';
import { makeCatalogGridDescriptor } from '@/components/products/catalog/catalog-grid/catalog-grid-descriptor';
import { makeReceivingGridDescriptor } from '@/components/station/receiving-grid/receiving-grid-descriptor';
import { makeIncomingGridDescriptor } from '@/components/station/incoming-grid/incoming-grid-descriptor';
import { makeOrdersGridDescriptor } from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import { makeRepairGridDescriptor } from '@/components/repair/repair-grid/repair-grid-descriptor';
import { makePickupGridDescriptor } from '@/components/receiving/pickup/grid/pickup-grid-descriptor';
import { STATION_HISTORY_GRID_CAPABILITIES } from '@/components/station/station-history-capabilities';
import { FBA_BOARD_GRID_CAPABILITIES } from '@/components/fba/fba-board-capabilities';
import { MY_DAY_GRID_CAPABILITIES, makeMyDayGridDescriptor } from '@/features/my-day/grid/my-day-grid-descriptor';
import { MY_DAY_GRID_COLUMNS } from '@/lib/my-day/my-day-grid-layout';
import {
  TECH_ALL_GRID_CAPABILITIES,
  makeTechAllGridDescriptor,
} from '@/components/tech/all/tech-all-grid-descriptor';
import { TECH_ALL_GRID_COLUMNS } from '@/lib/tech/tech-all-grid-layout';
import { WARRANTY_GRID_CAPABILITIES } from '@/components/warranty/grid/warranty-grid-descriptor';
import { makeWarrantyGridDescriptor } from '@/components/warranty/grid/warranty-grid-descriptor';
import { WARRANTY_GRID_COLUMNS } from '@/components/warranty/grid/warranty-grid-layout';
import { READY_GRID_CAPABILITIES, makeReadyGridDescriptor } from '@/components/outbound/ready/grid/ready-grid-descriptor';
import { READY_GRID_COLUMNS } from '@/components/outbound/ready/grid/ready-grid-layout';
import {
  TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
  makeTrackingExceptionsGridDescriptor,
} from '@/components/tracking-exceptions/grid/tracking-exceptions-grid-descriptor';
import { TRACKING_EXCEPTIONS_GRID_COLUMNS } from '@/components/tracking-exceptions/grid/tracking-exceptions-grid-layout';
import {
  UNFOUND_GRID_CAPABILITIES,
  makeUnfoundGridDescriptor,
} from '@/components/receiving/unfound/grid/unfound-grid-descriptor';
import { UNFOUND_GRID_COLUMNS } from '@/components/receiving/unfound/grid/unfound-grid-layout';
import {
  BINS_GRID_CAPABILITIES,
  makeBinsGridDescriptor,
} from '@/components/warehouse/bins-grid/bins-grid-descriptor';
import { BINS_GRID_COLUMNS } from '@/components/warehouse/bins-grid/bins-grid-layout';
import {
  CATALOG_LINK_GRID_CAPABILITIES,
  makeCatalogLinkGridDescriptor,
  makeImportExceptionGridDescriptor,
} from '@/features/review/catalog-link/grid/catalog-link-grid-descriptor';
import { CATALOG_LINK_GRID_COLUMNS } from '@/features/review/catalog-link/grid/catalog-link-grid-layout';
import { IMPORT_EXCEPTION_GRID_COLUMNS } from '@/features/review/catalog-link/grid/import-exception-grid-layout';

const REQUIRED_KEYS: readonly (keyof GridSurfaceCapabilities)[] = [
  'rowTriageFlags',
  'multiSelect',
  'inCellEdit',
  'fieldsMenu',
  'dayBands',
];

/**
 * Every declared bag in the product, by surface name.
 *
 * Keep this keyed the same way {@link MOUNTS} is — the discovery test below
 * asserts the two agree, so adding a mount without a bag (or a bag whose mount
 * disappeared) fails rather than drifts.
 */
const DECLARED_CAPABILITIES: Record<string, GridSurfaceCapabilities> = {
  orders: ORDERS_GRID_CAPABILITIES,
  catalog: CATALOG_GRID_CAPABILITIES,
  receiving: RECEIVING_GRID_CAPABILITIES,
  incoming: INCOMING_GRID_CAPABILITIES,
  repair: REPAIR_GRID_CAPABILITIES,
  pickup: PICKUP_GRID_CAPABILITIES,
  'station-history': STATION_HISTORY_GRID_CAPABILITIES,
  fba: FBA_BOARD_GRID_CAPABILITIES,
  warranty: WARRANTY_GRID_CAPABILITIES,
  'my-day': MY_DAY_GRID_CAPABILITIES,
  'tech-all': TECH_ALL_GRID_CAPABILITIES,
  ready: READY_GRID_CAPABILITIES,
  'tracking-exceptions': TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
  unfound: UNFOUND_GRID_CAPABILITIES,
  bins: BINS_GRID_CAPABILITIES,
  // ONE bag for both Review · Catalog-link tabs: they differ in what their
  // columns MEAN, not in what the surface may do.
  'catalog-link': CATALOG_LINK_GRID_CAPABILITIES,
};

function assertComplete(name: string, caps: GridSurfaceCapabilities) {
  for (const key of REQUIRED_KEYS) {
    assert.equal(typeof caps[key], 'boolean', `${name}.${key} must be an explicit boolean`);
  }
}

describe('grid surface capabilities', () => {
  it('Orders is the only family with staff triage row wash', () => {
    assert.equal(ORDERS_GRID_CAPABILITIES.rowTriageFlags, true);
    assert.equal(CATALOG_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(RECEIVING_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(INCOMING_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(REPAIR_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(PICKUP_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(WARRANTY_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(READY_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(TRACKING_EXCEPTIONS_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(UNFOUND_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(BINS_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(CATALOG_LINK_GRID_CAPABILITIES.rowTriageFlags, false);
  });

  it('every family declares a complete capabilities bag', () => {
    for (const [name, caps] of Object.entries(DECLARED_CAPABILITIES)) {
      assertComplete(name, caps);
    }
  });

  it('station history does not inherit outbound triage wash', () => {
    // The benches render through `OrdersQueueTableRow` inside `LedgerGrid`, so
    // the ONLY thing separating a Tech log row from an outbound dispatch row is
    // this declaration. Triage is dispatch vocabulary; a log of finished work
    // has nothing to triage.
    assert.equal(STATION_HISTORY_GRID_CAPABILITIES.rowTriageFlags, false);
    assert.equal(FBA_BOARD_GRID_CAPABILITIES.rowTriageFlags, false);
  });

  it('descriptors carry the family capabilities (no silent omit)', () => {
    assert.deepEqual(
      makeOrdersGridDescriptor('fulfillment.default', ORDERS_QUEUE_COLUMNS).capabilities,
      ORDERS_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeCatalogGridDescriptor(CATALOG_GRID_COLUMNS).capabilities,
      CATALOG_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeReceivingGridDescriptor(RECEIVING_GRID_COLUMNS).capabilities,
      RECEIVING_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeIncomingGridDescriptor(INCOMING_GRID_COLUMNS).capabilities,
      INCOMING_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeRepairGridDescriptor(REPAIR_GRID_COLUMNS).capabilities,
      REPAIR_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makePickupGridDescriptor(PICKUP_GRID_COLUMNS).capabilities,
      PICKUP_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeWarrantyGridDescriptor(WARRANTY_GRID_COLUMNS).capabilities,
      WARRANTY_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeReadyGridDescriptor(READY_GRID_COLUMNS).capabilities,
      READY_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeTrackingExceptionsGridDescriptor(TRACKING_EXCEPTIONS_GRID_COLUMNS).capabilities,
      TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeUnfoundGridDescriptor(UNFOUND_GRID_COLUMNS).capabilities,
      UNFOUND_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeBinsGridDescriptor(BINS_GRID_COLUMNS).capabilities,
      BINS_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeMyDayGridDescriptor(MY_DAY_GRID_COLUMNS).capabilities,
      MY_DAY_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeTechAllGridDescriptor(TECH_ALL_GRID_COLUMNS).capabilities,
      TECH_ALL_GRID_CAPABILITIES,
    );
    // Both Review tabs resolve to the SAME bag — the whole point of one
    // declaration for one surface.
    assert.deepEqual(
      makeCatalogLinkGridDescriptor(CATALOG_LINK_GRID_COLUMNS).capabilities,
      CATALOG_LINK_GRID_CAPABILITIES,
    );
    assert.deepEqual(
      makeImportExceptionGridDescriptor(IMPORT_EXCEPTION_GRID_COLUMNS).capabilities,
      CATALOG_LINK_GRID_CAPABILITIES,
    );
  });

  it('Review · Catalog link never edits in a cell', () => {
    // The load-bearing flag on this surface: tab B's Item Number looks like a
    // textbook single-value in-cell field, but resolving it re-runs the sheet
    // import and CREATES an order. Side-effectful multi-step work is the record
    // plane — flipping this to `true` would put an order-creating write one
    // keystroke away in a grid cell.
    assert.equal(CATALOG_LINK_GRID_CAPABILITIES.inCellEdit, false);
    assert.equal(CATALOG_LINK_GRID_CAPABILITIES.multiSelect, false);
  });

  it('My Day is browse-only — a personal task list has no bulk plane', () => {
    // Every flag false is a decision, not a default: the record a Today row
    // points at owns its own status, so an in-cell editor here would write
    // nowhere, and there is no bulk action on one operator's own day.
    assert.equal(MY_DAY_GRID_CAPABILITIES.multiSelect, false);
    assert.equal(MY_DAY_GRID_CAPABILITIES.inCellEdit, false);
    assert.equal(MY_DAY_GRID_CAPABILITIES.rowTriageFlags, false);
  });

  it('read maps stay browse-only (no multi-select)', () => {
    // Nothing on either surface acts on N rows at once, and a gutter with no
    // wiring behind it is the inert gutter the workbench law bans.
    assert.equal(PICKUP_GRID_CAPABILITIES.multiSelect, false);
    assert.equal(WARRANTY_GRID_CAPABILITIES.multiSelect, false);
    assert.equal(READY_GRID_CAPABILITIES.multiSelect, false);
    assert.equal(TRACKING_EXCEPTIONS_GRID_CAPABILITIES.multiSelect, false);
    assert.equal(UNFOUND_GRID_CAPABILITIES.multiSelect, false);
  });

  it('Orders + Unfound keep in-cell edit; Catalog / Receiving do not', () => {
    assert.equal(ORDERS_GRID_CAPABILITIES.inCellEdit, true);
    assert.equal(UNFOUND_GRID_CAPABILITIES.inCellEdit, true);
    assert.equal(CATALOG_GRID_CAPABILITIES.inCellEdit, false);
    assert.equal(RECEIVING_GRID_CAPABILITIES.inCellEdit, false);
  });

  it('Warehouse bins keeps multi-select for the bulk action bar', () => {
    // Print-labels / cycle-count act on N bins — the left gutter is a live
    // checkbox plane. Everything else on the surface stays browse-only.
    assert.equal(BINS_GRID_CAPABILITIES.multiSelect, true);
    assert.equal(BINS_GRID_CAPABILITIES.inCellEdit, false);
    assert.equal(BINS_GRID_CAPABILITIES.rowTriageFlags, false);
  });
});

// ── Discovery half: no mount without a declaration ─────────────────────────────

const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * Files allowed to mount the grid without declaring a bag of their own.
 *
 * Exactly one, and it is the SoT wrapper itself: `LedgerGridSurface` mounts
 * `LedgerGrid` on behalf of a descriptor its caller supplies, so its capability
 * declaration IS the caller's. Anything else added here is a surface opting out
 * of the gate — say why in a comment or do not add it.
 */
const MOUNT_EXEMPT = new Set([
  'src/design-system/components/grid/LedgerGridSurface.tsx',
  // The registry host (plan Phase 1) is the same category as the surface above:
  // it mounts the engine on behalf of a `TableSurfaceBinding` its caller
  // supplies, so its capability declaration IS the caller's. It is exempt from
  // naming a bag, NOT from the gate — the discovery regex below counts a
  // `<NonlinearTableHost` mount, so a page binding still has to name one.
  'src/components/tables/NonlinearTableHost.tsx',
]);

/**
 * Mount file → the surface name whose bag it renders under.
 *
 * The value must be a key of {@link DECLARED_CAPABILITIES}; the tests below pin
 * both directions, so a mount with no bag and a bag with no mount both fail.
 */
const MOUNTS: Record<string, string> = {
  'src/components/dashboard/orders-queue/OrdersGridView.tsx': 'orders',
  'src/components/station/receiving-grid/ReceivingGridView.tsx': 'receiving',
  'src/components/station/incoming-grid/IncomingGridView.tsx': 'incoming',
  'src/components/products/catalog/ProductsCatalogWorkspace.tsx': 'catalog',
  'src/components/repair/repair-grid/RepairGridView.tsx': 'repair',
  'src/components/receiving/pickup/grid/PickupGridView.tsx': 'pickup',
  'src/components/warranty/WarrantyClaimsTable.tsx': 'warranty',
  'src/components/outbound/ready/ReadyQueueTable.tsx': 'ready',
  'src/components/tracking-exceptions/grid/TrackingExceptionsGridView.tsx': 'tracking-exceptions',
  'src/components/receiving/unfound/UnfoundQueueTable.tsx': 'unfound',
  'src/components/warehouse/bins-grid/BinsGridView.tsx': 'bins',
  'src/features/my-day/grid/MyDayGridView.tsx': 'my-day',
  'src/components/tech/all/TechAllGridView.tsx': 'tech-all',
  // Both Review · Catalog-link tabs mount from ONE file under ONE bag.
  'src/features/review/catalog-link/grid/ReviewCatalogLinkGridView.tsx': 'catalog-link',
  'src/components/station/StationListTable.tsx': 'station-history',
  'src/components/fba/FbaBoardTable.tsx': 'fba',
};

/**
 * JSX mounts only — `<LedgerGrid` / `<LedgerGridSurface` / `<NonlinearTableHost`
 * opening a generic or a prop.
 *
 * The host joined this regex when the definition registry landed (plan Phase 1).
 * It has to: a page that mounts the host is still a grid surface, and if
 * discovery only knew the engine's names then migrating a view onto the host
 * would silently drop it out of the gate — the surface would keep rendering and
 * the guard would go quiet, which is precisely the failure the discovery half
 * was added to catch. What this guard pins is the invariant (no grid surface
 * without a declared bag), not the mechanism that reaches it.
 */
const MOUNT_RE = /<(?:LedgerGrid(?:Surface)?|NonlinearTableHost)[<\s/>]/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) out.push(rel);
  }
  return out;
}

/** Every file that actually mounts the grid, discovered off disk. */
function discoverMounts(): string[] {
  return sourceFiles('src')
    .filter((rel) => MOUNT_RE.test(readFileSync(resolve(ROOT, rel), 'utf8')))
    .filter((rel) => !MOUNT_EXEMPT.has(rel))
    .sort();
}

describe('ledger grid mounts', () => {
  it('every mount renders under a declared capabilities bag', () => {
    const undeclared = discoverMounts().filter((rel) => !MOUNTS[rel]);
    assert.deepEqual(
      undeclared,
      [],
      'These files mount LedgerGrid / LedgerGridSurface with no declared ' +
        'GridSurfaceCapabilities:\n  ' +
        undeclared.join('\n  ') +
        '\nA grid surface with no bag is UNCLASSIFIED, not feature-free — it is ' +
        'what lets a capability leak in through a shared row component. Declare ' +
        'one (see station-history-capabilities.ts) and register it in MOUNTS.',
    );
  });

  it('every registered mount still exists', () => {
    const found = new Set(discoverMounts());
    const stale = Object.keys(MOUNTS).filter((rel) => !found.has(rel));
    assert.deepEqual(stale, [], `MOUNTS lists files that no longer mount the grid: ${stale.join(', ')}`);
  });

  it('every registered mount names a bag that exists', () => {
    for (const [rel, name] of Object.entries(MOUNTS)) {
      assert.ok(
        DECLARED_CAPABILITIES[name],
        `${rel} names surface '${name}', which has no entry in DECLARED_CAPABILITIES`,
      );
    }
  });

  it('every declared bag belongs to a real mount', () => {
    const mounted = new Set(Object.values(MOUNTS));
    const orphans = Object.keys(DECLARED_CAPABILITIES).filter((name) => !mounted.has(name));
    assert.deepEqual(orphans, [], `Declared but never mounted: ${orphans.join(', ')}`);
  });
});

// ── Forest freeze: the `*GridView.tsx` wrapper set is shrink-only ───────────────

/**
 * The `*GridView.tsx` wrapper forest, frozen.
 *
 * Phase 3 of the table-definition-registry migration collapsed every Workbench
 * spreadsheet onto `NonlinearTableHost`, and its exit criterion is a policy, not
 * merely a state reached once: **"a new queue ships without a new GridView file
 * — only a registry entry + a page binding."** A page that needs a grid binds
 * `<NonlinearTableHost binding={…}>` where it renders; it does not grow a new
 * wrapper component to hold the mount.
 *
 * This list makes that policy enforceable. It is **shrink-only**: deleting a
 * wrapper (the strangler's endgame) removes a line here; adding one fails. This
 * is the second half of the plan's Phase-3 ratchet — the discovery guard above
 * already fails a mount with no bag ("a page outside the allowlist mounts the
 * grid"); this fails the other clause ("or adds a new `*GridView.tsx`").
 *
 * ## Why this is filename-based, right next to a guard that bans that
 *
 * The mount guard above discovers by CONTENT on purpose: "is this a grid
 * surface" must survive someone renaming `FooGridView` to `FooTable`, or the
 * capability-bag requirement is dodged by a rename. This freeze answers a
 * DIFFERENT question — "did the wrapper NAMING PATTERN regrow" — and the
 * `*GridView.tsx` suffix *is* that pattern, so the filename is the signal here,
 * not a leak. The two are orthogonal and both live: content-discovery pins the
 * invariant (every mount names a bag); this pins the shape the plan retired (no
 * new wrapper file). A `FooTable.tsx` that mounts the host still answers to the
 * content guard — it is simply not a member of the forest this list freezes.
 */
const GRID_VIEW_FOREST: string[] = [
  'src/components/dashboard/orders-queue/OrdersGridView.tsx',
  'src/components/receiving/pickup/grid/PickupGridView.tsx',
  'src/components/repair/repair-grid/RepairGridView.tsx',
  'src/components/station/incoming-grid/IncomingGridView.tsx',
  'src/components/station/receiving-grid/ReceivingGridView.tsx',
  'src/components/tech/all/TechAllGridView.tsx',
  'src/components/tracking-exceptions/grid/TrackingExceptionsGridView.tsx',
  'src/components/warehouse/bins-grid/BinsGridView.tsx',
  'src/features/my-day/grid/MyDayGridView.tsx',
  'src/features/review/catalog-link/grid/ReviewCatalogLinkGridView.tsx',
];

/** Every `*GridView.tsx` wrapper on disk, off the same walk the mounts use. */
function discoverGridViewForest(): string[] {
  return sourceFiles('src')
    .filter((rel) => /GridView\.tsx$/.test(rel))
    .sort();
}

describe('grid view forest (shrink-only)', () => {
  it('no new *GridView.tsx wrapper — bind a new queue via the registry, not a wrapper file', () => {
    const found = discoverGridViewForest();
    const frozen = [...GRID_VIEW_FOREST].sort();
    const added = found.filter((rel) => !frozen.includes(rel));
    const removed = frozen.filter((rel) => !found.includes(rel));

    assert.deepEqual(
      found,
      frozen,
      [
        added.length
          ? 'A new `*GridView.tsx` wrapper appeared:\n  ' +
            added.join('\n  ') +
            '\nThe wrapper forest is frozen (table-registry plan, Phase-3 exit: "a new\n' +
            'queue ships without a new GridView file"). Bind the queue where it renders —\n' +
            '`<NonlinearTableHost binding={makeXBinding(...)}>` + a table-definition-registry\n' +
            'entry — instead of a new wrapper component. If a wrapper is genuinely warranted,\n' +
            'that is a reviewed decision: add it to GRID_VIEW_FOREST with a reason.'
          : '',
        removed.length
          ? 'A frozen wrapper is gone (a migration deleted it — good):\n  ' +
            removed.join('\n  ') +
            '\nRemove it from GRID_VIEW_FOREST. The list shrinks with the forest, never grows.'
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  });
});
