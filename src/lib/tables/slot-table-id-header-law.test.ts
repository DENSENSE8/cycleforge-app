/**
 * Tripwire — the ID header law.
 *
 * Run: npx tsx --test src/lib/tables/slot-table-id-header-law.test.ts
 *
 * This is the gate that actually holds the rule, because it reads the
 * MATERIALIZED columns of every product default rather than the source text: a
 * family can only break it by painting a different word, which is exactly the
 * thing being forbidden. The ESLint rule and the `Id header` verify gate are
 * the fast feedback in front of it, not substitutes for it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import {
  SLOT_TABLE_ID_HEADER_FILES,
  SLOT_TABLE_ID_HEADER_WORD,
  SLOT_TABLE_IDENTITY_TRACK_KEYS,
  SLOT_TABLE_NO_IDENTITY_TRACK_PEERS,
  isSlotTableIdentityTrack,
} from '@/lib/tables/slot-table-id-header-law';

import { PART_COMPATIBILITY_COMPOUND_COLUMNS } from '@/components/admin/sourcing/part-compatibility-grid-layout';
import { UNIT_ALLOCATIONS_COMPOUND_COLUMNS } from '@/components/inventory/allocations-grid/unit-allocations-grid-layout';
import { ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS } from '@/components/inventory/bulk-allocate-grid/admin-bulk-allocate-grid-layout';
import { CYCLECOUNTLINES_COMPOUND_COLUMNS } from '@/components/inventory/cycle-count-lines/cycle-count-lines-grid-layout';
import { CYCLECOUNTS_COMPOUND_COLUMNS } from '@/components/inventory/cycle-counts/cycle-counts-grid-layout';
import { ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS } from '@/components/inventory/drift-grid/admin-drift-alerts-grid-layout';
import { ADMIN_SKU_DRIFT_COMPOUND_COLUMNS } from '@/components/inventory/drift-grid/admin-sku-drift-grid-layout';
import { INVENTORY_EVENTS_COMPOUND_COLUMNS } from '@/components/inventory/events-grid/inventory-events-grid-layout';
import { ADMINHOLDS_COMPOUND_COLUMNS } from '@/components/inventory/holds-grid/admin-holds-grid-layout';
import { SKU_EXCEPTIONS_COMPOUND_COLUMNS } from '@/components/inventory/sku-exceptions/sku-exceptions-table-definition';
import { ADMIN_RETURNS_COMPOUND_COLUMNS } from '@/components/inventory/returns-grid/admin-returns-grid-layout';
import { SKU_ALLOCATIONS_COMPOUND_COLUMNS } from '@/components/inventory/sku-allocations-grid/sku-allocations-table-definition';
import { SKU_BINS_COMPOUND_COLUMNS } from '@/components/inventory/sku-bins-grid/sku-bins-table-definition';
import { SKU_LEDGER_COMPOUND_COLUMNS } from '@/components/inventory/sku-ledger-grid/sku-ledger-grid-layout';
import { UNIT_TSN_LINKS_COMPOUND_COLUMNS } from '@/components/inventory/tsn-links-grid/unit-tsn-links-grid-layout';
import { REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS } from '@/components/reports/report-bin-utilization-grid/report-bin-utilization-grid-layout';
import { REPORT_DEAD_STOCK_COMPOUND_COLUMNS } from '@/components/reports/report-dead-stock-grid/report-dead-stock-grid-layout';
import { REPORT_STAFF_DAY_COMPOUND_COLUMNS } from '@/components/reports/report-staff-day-grid/report-staff-day-grid-layout';
import { REPORT_VELOCITY_COMPOUND_COLUMNS } from '@/components/reports/report-velocity-grid/report-velocity-grid-layout';
import { SEARCH_HITS_COMPOUND_COLUMNS } from '@/components/search/hits-grid/search-hits-grid-layout';
import { AUDITLOG_COMPOUND_COLUMNS } from '@/components/settings/audit-log/audit-log-grid-layout';
import { KIOSKDEVICES_COMPOUND_COLUMNS } from '@/components/settings/kiosk-devices/kiosk-devices-grid-layout';
import { KIOSKSLOTEVENTS_COMPOUND_COLUMNS } from '@/components/settings/kiosk-slot-events/kiosk-slot-events-grid-layout';
import { AUTHSESSIONS_COMPOUND_COLUMNS } from '@/components/settings/sessions/auth-sessions-grid-layout';
import { STAFF_DIRECTORY_COMPOUND_COLUMNS } from '@/components/settings/staff-directory/staff-directory-grid-layout';
import {
  PACKER_COMPOUND_COLUMNS,
  TECH_COMPOUND_COLUMNS,
} from '@/components/station/bench-grid/bench-grid-layout';
import { WALKINSALES_COMPOUND_COLUMNS } from '@/components/walk-in/grid/walk-in-sales-grid-layout';
import { CATALOG_LINK_COMPOUND_COLUMNS } from '@/features/review/catalog-link/grid/catalog-link-grid-layout';
import { IMPORT_EXCEPTION_COMPOUND_COLUMNS } from '@/features/review/catalog-link/grid/import-exception-grid-layout';
import { DAILY_COMPOUND_COLUMNS } from '@/features/home/grid/daily-table-definition';
import { ORDERS_COMPOUND_COLUMNS } from '@/lib/dashboard-order-row-layout';
import {
  INCOMING_COMPOUND_COLUMNS,
  RECEIVING_COMPOUND_COLUMNS,
} from '@/lib/receiving/receiving-grid-layout';
import { TASKS_COMPOUND_COLUMNS } from '@/features/tasks/grid/tasks-table-definition';
import { TECH_ALL_SHEET_COLUMNS } from '@/lib/tech/tech-all-grid-layout';

type Col = { key: string; label?: string; gridLabel?: string };

/**
 * Every product-default materialization that HAS an identity track. Listed by
 * import rather than scanned, because an import that stops resolving is a
 * failure and a glob that stops matching is silence.
 */
const MATERIALIZATIONS: readonly { name: string; columns: readonly Col[] }[] = [
  { name: 'ORDERS_COMPOUND_COLUMNS', columns: ORDERS_COMPOUND_COLUMNS },
  { name: 'RECEIVING_COMPOUND_COLUMNS', columns: RECEIVING_COMPOUND_COLUMNS },
  { name: 'INCOMING_COMPOUND_COLUMNS', columns: INCOMING_COMPOUND_COLUMNS },
  { name: 'TASKS_COMPOUND_COLUMNS', columns: TASKS_COMPOUND_COLUMNS },
  { name: 'DAILY_COMPOUND_COLUMNS', columns: DAILY_COMPOUND_COLUMNS },
  { name: 'CATALOG_LINK_COMPOUND_COLUMNS', columns: CATALOG_LINK_COMPOUND_COLUMNS },
  { name: 'IMPORT_EXCEPTION_COMPOUND_COLUMNS', columns: IMPORT_EXCEPTION_COMPOUND_COLUMNS },
  { name: 'TECH_COMPOUND_COLUMNS', columns: TECH_COMPOUND_COLUMNS },
  { name: 'PACKER_COMPOUND_COLUMNS', columns: PACKER_COMPOUND_COLUMNS },
  { name: 'PART_COMPATIBILITY_COMPOUND_COLUMNS', columns: PART_COMPATIBILITY_COMPOUND_COLUMNS },
  { name: 'UNIT_ALLOCATIONS_COMPOUND_COLUMNS', columns: UNIT_ALLOCATIONS_COMPOUND_COLUMNS },
  { name: 'ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS', columns: ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS },
  { name: 'CYCLECOUNTLINES_COMPOUND_COLUMNS', columns: CYCLECOUNTLINES_COMPOUND_COLUMNS },
  { name: 'CYCLECOUNTS_COMPOUND_COLUMNS', columns: CYCLECOUNTS_COMPOUND_COLUMNS },
  { name: 'ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS', columns: ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS },
  { name: 'ADMIN_SKU_DRIFT_COMPOUND_COLUMNS', columns: ADMIN_SKU_DRIFT_COMPOUND_COLUMNS },
  { name: 'INVENTORY_EVENTS_COMPOUND_COLUMNS', columns: INVENTORY_EVENTS_COMPOUND_COLUMNS },
  { name: 'ADMINHOLDS_COMPOUND_COLUMNS', columns: ADMINHOLDS_COMPOUND_COLUMNS },
  { name: 'ADMIN_RETURNS_COMPOUND_COLUMNS', columns: ADMIN_RETURNS_COMPOUND_COLUMNS },
  { name: 'SKU_EXCEPTIONS_COMPOUND_COLUMNS', columns: SKU_EXCEPTIONS_COMPOUND_COLUMNS },
  { name: 'SKU_BINS_COMPOUND_COLUMNS', columns: SKU_BINS_COMPOUND_COLUMNS },
  { name: 'SKU_LEDGER_COMPOUND_COLUMNS', columns: SKU_LEDGER_COMPOUND_COLUMNS },
  { name: 'SKU_ALLOCATIONS_COMPOUND_COLUMNS', columns: SKU_ALLOCATIONS_COMPOUND_COLUMNS },
  { name: 'UNIT_TSN_LINKS_COMPOUND_COLUMNS', columns: UNIT_TSN_LINKS_COMPOUND_COLUMNS },
  { name: 'REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS', columns: REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS },
  { name: 'REPORT_DEAD_STOCK_COMPOUND_COLUMNS', columns: REPORT_DEAD_STOCK_COMPOUND_COLUMNS },
  { name: 'REPORT_STAFF_DAY_COMPOUND_COLUMNS', columns: REPORT_STAFF_DAY_COMPOUND_COLUMNS },
  { name: 'REPORT_VELOCITY_COMPOUND_COLUMNS', columns: REPORT_VELOCITY_COMPOUND_COLUMNS },
  { name: 'SEARCH_HITS_COMPOUND_COLUMNS', columns: SEARCH_HITS_COMPOUND_COLUMNS },
  { name: 'AUDITLOG_COMPOUND_COLUMNS', columns: AUDITLOG_COMPOUND_COLUMNS },
  { name: 'KIOSKDEVICES_COMPOUND_COLUMNS', columns: KIOSKDEVICES_COMPOUND_COLUMNS },
  { name: 'KIOSKSLOTEVENTS_COMPOUND_COLUMNS', columns: KIOSKSLOTEVENTS_COMPOUND_COLUMNS },
  { name: 'AUTHSESSIONS_COMPOUND_COLUMNS', columns: AUTHSESSIONS_COMPOUND_COLUMNS },
  { name: 'STAFF_DIRECTORY_COMPOUND_COLUMNS', columns: STAFF_DIRECTORY_COMPOUND_COLUMNS },
  { name: 'WALKINSALES_COMPOUND_COLUMNS', columns: WALKINSALES_COMPOUND_COLUMNS },
  { name: 'TECH_ALL_SHEET_COLUMNS', columns: TECH_ALL_SHEET_COLUMNS },
];

describe('slot-table ID header law', () => {
  it('every identity track on every peer reads the one word', () => {
    for (const { name, columns } of MATERIALIZATIONS) {
      const identity = columns.find((c) => isSlotTableIdentityTrack(c.key));
      assert.ok(identity, `${name} has no identity track — add it to SLOT_TABLE_NO_IDENTITY_TRACK_PEERS or bind one`);
      assert.equal(
        identity.gridLabel,
        SLOT_TABLE_ID_HEADER_WORD,
        `${name}: column one reads ${JSON.stringify(identity.gridLabel)}. The engine owns this word.`,
      );
      assert.equal(
        identity.label,
        SLOT_TABLE_ID_HEADER_WORD,
        `${name}: the identity label (aria / picker face) reads ${JSON.stringify(identity.label)}.`,
      );
    }
  });

  it('the identity track is the first DATA column — position, not preference', () => {
    const firstData = COMPOUND_COLUMN_KEYS.find((k) => !isSlotTableChromeTrack(k));
    assert.equal(firstData, 'fulfillment', 'the compound skeleton no longer opens on its identity track');
    for (const { name, columns } of MATERIALIZATIONS) {
      const firstPainted = columns.find((c) => !isSlotTableChromeTrack(c.key));
      assert.ok(
        firstPainted && isSlotTableIdentityTrack(firstPainted.key),
        `${name}: column one is ${JSON.stringify(firstPainted?.key)}, not the identity track`,
      );
    }
  });

  it('no family re-declares the header — the drift engine stays deleted', () => {
    for (const file of SLOT_TABLE_ID_HEADER_FILES) {
      const src = readFileSync(file, 'utf8');
      assert.doesNotMatch(
        src,
        /(label|gridLabel):\s*identity\.label/,
        `${file} re-declares the identity header from its catalog. That is the 22-copy drift engine returning.`,
      );
    }
  });

  it('the sheet peers with no identity track are named, not silently exempt', () => {
    // Held EXACT: a family cannot join this list to escape the law, and an
    // entry cannot linger after that family gains an identity track.
    const named = new Set(SLOT_TABLE_NO_IDENTITY_TRACK_PEERS.map((p) => p.columns));
    assert.equal(named.size, SLOT_TABLE_NO_IDENTITY_TRACK_PEERS.length, 'duplicate exemption');
    for (const peer of SLOT_TABLE_NO_IDENTITY_TRACK_PEERS) {
      assert.ok(peer.why.length > 40, `${peer.columns}: an exemption needs a reason, not a shrug`);
      assert.ok(
        !(SLOT_TABLE_IDENTITY_TRACK_KEYS as readonly string[]).includes(peer.firstKey),
        `${peer.columns} claims no identity track but opens on ${peer.firstKey}`,
      );
    }
    for (const { name } of MATERIALIZATIONS) {
      assert.ok(!named.has(name), `${name} is both enforced and exempt`);
    }
  });
});
