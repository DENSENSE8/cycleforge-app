/**
 * The DESK SURFACE LEDGER — every desktop file the desk surface law
 * (`./desk-surface-law.ts`) hits today, classified, with a shrink-only debt
 * baseline per rule. Landed 2026-09-25 with the gate.
 *
 * ## Rail roles
 * - `record`       — DEBT. A picked row's record (or a multi-field record /
 *                    create form) living in the right rail or an in-flow
 *                    evidence aside. Converts to the record plane: in place of
 *                    the fixed-width list by default, list-left / record-right
 *                    split when the staffer chooses fullscreen (J/K, Esc back,
 *                    deep-link param).
 * - `supporting`   — tools over the WHOLE table while it stays visible (view
 *                    controls, import staging, bulk panels, compare, watch).
 *                    Allowed; must never grow a per-record editor.
 * - `station-edge` — a scan-station bench's right-edge tool (station law keeps
 *                    Displays on the right). Allowed.
 * - `linked-peek`  — a quick look at a LINKED entity from inside another
 *                    record. Allowed.
 *
 * ## Ratchet
 * Converting a `record` rail: delete its entry and drop that rule's baseline
 * in the SAME commit — the gate fails until both move together. Adding a
 * `record` entry means raising a baseline, which is an owner ruling, never a
 * side effect of shipping a feature.
 */

import type { DeskSurfaceLedger } from './desk-surface-law';

const record = { role: 'record' } as const;
const legacy = { role: 'legacy' } as const;
const supporting = (note: string) => ({ role: 'supporting', note }) as const;
const stationEdge = (note: string) => ({ role: 'station-edge', note }) as const;

export const DESK_SURFACE_LEDGER: DeskSurfaceLedger = {
  rail: {
    // ── record rails (debt) ─────────────────────────────────────────────────
    // Outbound — the order inspector, peek and entry rails.
    'src/components/shipped/ShippedDetailsPanel.tsx': record,
    'src/components/order-record/CompactOrderPeek.tsx': record,
    'src/components/orders/NewOrderEntryOverlay.tsx': record,
    'src/components/detail-stacks/GlobalDetailStackHost.tsx': record,
    // Receiving — Unbox history, unfound, repair.
    // Inventory, catalog, photos, warehouse, FBA, warranty.
    'src/components/inventory/InventoryInspectorRail.tsx': record,
    'src/components/sku/SkuDetailView.tsx': record,
    'src/components/photos/photo-inspector/PhotoInspectorPanel.tsx': record,
    'src/components/warehouse/BinDetailFlyout.tsx': record,
    'src/components/fba/FbaBoardDetailPanel.tsx': record,
    'src/components/warranty/WarrantyClaimDetailPanel.tsx': record,
    'src/features/review/catalog-link/CatalogLinkFormRail.tsx': record,

    // ── supporting rails (allowed) ──────────────────────────────────────────
    'src/components/forge/ForgePlanRail.tsx': supporting('Live plan monitor opened from the console toggle, not from a row.'),
    'src/components/outbound/orders/CsvImportStagingRail.tsx': supporting('Import staging for the whole desk while the table stays visible.'),
    'src/components/outbound/orders/OrderIngestRail.tsx': supporting('Order ingest tool over the whole desk.'),
    'src/components/outbound/orders/OrdersViewControlsRail.tsx': supporting('View controls for the table beside it.'),
    'src/components/outbound/label-intake/LabelIntakeDesk.tsx': supporting('Reference column: labels already recorded under the number the centre form is working.'),
    'src/components/photos/photo-inspector/PhotoBatchInspectorPanel.tsx': supporting('Batch actions over the checked photo selection.'),
    'src/components/receiving/rail/ReceivingLineRailShell.tsx': supporting('Batch actions over the checked receiving lines.'),
    'src/components/receiving/workspace/ZohoSplitPane.tsx': supporting('External PO link pane — provider pages cannot be embedded.'),
    'src/components/repair/rail/RepairRailShell.tsx': supporting('Batch actions over the checked repairs.'),
    'src/components/sidebar/receiving/IncomingSyncDialog.tsx': supporting('Inbound sync tool over the whole desk.'),
    'src/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel.tsx': supporting('Bulk tracking paste over the whole desk.'),
    'src/components/sidebar/receiving/incoming/IncomingDeskRightRail.tsx': supporting('Incoming desk band tools (check receipts, filter paste, CSV import).'),
    'src/components/sidebar/receiving/incoming/IncomingReturnsImportStagingRail.tsx': supporting('Returns import staging over the whole desk.'),

    // ── station-edge rails (allowed) ────────────────────────────────────────
    'src/components/receiving/workspace/ReceivingAuditRail.tsx': stationEdge('Unbox bench audit tool on the station edge.'),
    'src/components/receiving/workspace/SendPhotoNoteRail.tsx': stationEdge('Unbox bench photo-note tool on the station edge.'),
    'src/components/receiving/workspace/line-edit/MovePhotosBetweenPoRail.tsx': stationEdge('Unbox bench photo move tool on the station edge.'),
    'src/components/sidebar/TestingSidebarPanel.tsx': stationEdge('Testing bench box / manifest panels opened by a scan.'),
    'src/components/tech/TechRepairRail.tsx': stationEdge('Testing bench: a repair ticket opened by a scan, on the station edge (the Repair desk shows the same body on DeskRecordPlane).'),

    // ── linked peeks (allowed) ──────────────────────────────────────────────
    'src/components/support/context/SupportContextDetailPanel.tsx': {
      role: 'linked-peek',
      note: 'Context of entities linked to the open support ticket.',
    },
  },
  'search-desk-copy': {
    'src/components/search/SearchResultsSurface.tsx': legacy,
    'src/components/search/dossier/SearchOrderLedger.tsx': legacy,
    'src/components/search/hits-grid/useSearchHitsSpreadsheet.ts': legacy,
  },
  'binding-inspector': {
    'src/components/inventory/units-grid/units-table-definition.ts': legacy,
    'src/components/outbound/orders/import-staging/csv-import-staging-table-definition.ts': legacy,
    'src/components/station/bench-grid/bench-table-definition.ts': legacy,
    'src/components/warehouse/bins-grid/bins-table-definition.ts': legacy,
    'src/components/warranty/grid/warranty-table-definition.ts': legacy,
    'src/features/review/catalog-link/grid/catalog-link-table-definition.ts': legacy,
    'src/features/review/catalog-link/grid/import-exception-table-definition.ts': legacy,
  },
  // Every desk record is placed by DeskRecordPlane (Shipped moved 2026-09-25).
  'record-plane': {},
};

/** Debt entries per rule. SHRINK-ONLY — drop in the same commit as the conversion. */
export const DESK_SURFACE_DEBT_BASELINE: Readonly<Record<string, number>> = {
  rail: 11,
  'search-desk-copy': 3,
  'binding-inspector': 7,
  'record-plane': 0,
};
