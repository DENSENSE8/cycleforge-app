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
  });

  it('Pickup stays browse-only (no multi-select)', () => {
    assert.equal(PICKUP_GRID_CAPABILITIES.multiSelect, false);
  });

  it('Orders keeps in-cell edit; Catalog / Receiving do not', () => {
    assert.equal(ORDERS_GRID_CAPABILITIES.inCellEdit, true);
    assert.equal(CATALOG_GRID_CAPABILITIES.inCellEdit, false);
    assert.equal(RECEIVING_GRID_CAPABILITIES.inCellEdit, false);
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
const MOUNT_EXEMPT = new Set(['src/design-system/components/grid/LedgerGridSurface.tsx']);

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
  'src/components/products/catalog/catalog-grid/CatalogGridView.tsx': 'catalog',
  'src/components/repair/repair-grid/RepairGridView.tsx': 'repair',
  'src/components/receiving/pickup/grid/PickupGridView.tsx': 'pickup',
  'src/components/station/StationListTable.tsx': 'station-history',
  'src/components/fba/FbaBoardTable.tsx': 'fba',
};

/** JSX mounts only — `<LedgerGrid`/`<LedgerGridSurface` opening a generic or a prop. */
const MOUNT_RE = /<LedgerGrid(?:Surface)?[<\s/>]/;

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
