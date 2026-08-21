'use client';

/**
 * To-ship Add-orders rail — the Unbox right-rail recipe, exactly.
 *
 * | Unbox Displays | here |
 * |---|---|
 * | single push column | `DetailStackRailRegistrar` → the one `RightRailHost` slot |
 * | top chrome band | `DeskRailChromeRow` (host paints maximize + the singleton close) |
 * | Root Index → leaf | `DeskInspectorIndexShell` |
 * | `Filter displays…` find row + ↑↓/Enter | `indexFilter` |
 * | Esc = leaf → index | owned by the index shell |
 *
 * Compose `DeskInspectorIndexShell` — never a page-local index twin, and never
 * `StationDisplaysPushStack` on a desk rail.
 *
 * **The auto-close (fixed 2026-08-20) was never about the host.** `open` derives
 * from `?ingest=true` / `?new=true`, and `useSurfaceParamHygiene` (mounted in
 * `src/app/shipping/layout.tsx`) drops any param the route spec does not
 * declare. `ingest` was undeclared in `ORDERS_ROUTE_PARAMS`, so the chrome Add
 * wrote it and the next hygiene pass stripped it — the rail closed itself
 * before the operator could type. Any new ingest param must be declared there.
 *
 * Hand entry is TWO leaves (Add order · Replacement) rather than one leaf with
 * a `HorizontalButtonSlider` mode row inside it: the index already answers
 * "which lane", so the pills were a second mode control under the first.
 */

import { useEffect, useMemo, useState } from 'react';
import { Database, FileText, Globe, Plus, RefreshCw, RotateCcw } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { ShippedIntakeForm } from '@/components/shipped/ShippedIntakeForm';
import { OrderSyncDialog } from '@/components/sidebar/OrderSyncDialog';
import { useShippedFormSubmit } from '@/components/sidebar/dashboard-sidebar-hooks';
import { AwaitingEbayPanel } from '@/components/unshipped/AwaitingEbayPanel';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';
import { useAuth } from '@/contexts/AuthContext';
import { useOrdersSync } from '@/hooks/useOrdersSync';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import {
  FileImportSection,
  PlatformAddSection,
  SyncImportSection,
} from './OrderIngestPanel';

const ORDER_INGEST_RAIL_ID = 'detail:order-ingest';

const MANUAL_LEAF = 'manual';
const REPLACEMENT_LEAF = 'replacement';
const PLATFORM_LEAF = 'platform';
const FILE_LEAF = 'file';
const SYNC_LEAF = 'sync';
const BACKFILL_LEAF = 'backfill';

export function OrderIngestRail({
  open,
  onClose,
  initialLeaf = 'index',
}: {
  open: boolean;
  onClose: () => void;
  /** `manual` lands on hand entry (`?new=true`); otherwise Root Index. */
  initialLeaf?: 'index' | 'manual';
}) {
  const { has } = useAuth();
  const canImportOrders = has('orders.import');
  const csv = useTableImportFilePicker(ORDER_IMPORT_DESCRIPTOR);
  const { active: importActive } = useTableImportParam(ORDER_IMPORT_DESCRIPTOR);
  const sync = useOrdersSync();
  const submitNewOrder = useShippedFormSubmit(onClose);

  const [activeId, setActiveId] = useState(() =>
    initialLeaf === 'manual' ? MANUAL_LEAF : DESK_INSPECTOR_INDEX,
  );

  useEffect(() => {
    if (!open) return;
    setActiveId(initialLeaf === 'manual' ? MANUAL_LEAF : DESK_INSPECTOR_INDEX);
  }, [open, initialLeaf]);

  // CSV staging takes over the desk; the rail steps aside while it runs.
  const ingestEnabled = open && !importActive;

  const leaves = useMemo((): DeskInspectorLeaf[] => {
    const rows: DeskInspectorLeaf[] = [
      {
        id: MANUAL_LEAF,
        label: 'Add order manually',
        subtitle: 'New order, entered here',
        icon: Plus,
        group: 'context',
        tone: 'neutral',
        content: (
          <ShippedIntakeForm
            embedded
            hideModeTabs
            initialTab="add_order"
            onClose={onClose}
            onSubmit={submitNewOrder}
          />
        ),
      },
      {
        id: REPLACEMENT_LEAF,
        label: 'Replacement',
        subtitle: 'Reship against an existing order',
        icon: RotateCcw,
        group: 'context',
        tone: 'neutral',
        content: (
          <ShippedIntakeForm
            embedded
            hideModeTabs
            initialTab="replacement"
            onClose={onClose}
            onSubmit={submitNewOrder}
          />
        ),
      },
      {
        id: PLATFORM_LEAF,
        label: 'Add from platform',
        subtitle: 'Search the channel catalog',
        icon: Globe,
        group: 'context',
        tone: 'neutral',
        content: <PlatformAddSection onClose={onClose} />,
      },
    ];

    if (canImportOrders) {
      if (csv.live) {
        rows.push({
          id: FILE_LEAF,
          label: 'Import from file',
          subtitle: 'CSV staging on the desk',
          icon: FileText,
          group: 'assets',
          tone: 'neutral',
          content: (
            <FileImportSection
              error={csv.error}
              onClearError={csv.clearError}
              onChoose={csv.open}
            />
          ),
        });
      }
      rows.push(
        {
          id: SYNC_LEAF,
          label: 'Import latest orders',
          subtitle: 'Refresh populate from connected channels',
          icon: Database,
          group: 'assets',
          tone: sync.isTransferring ? 'action' : 'neutral',
          content: (
            <SyncImportSection
              isTransferring={sync.isTransferring}
              manualSheetName={sync.manualSheetName}
              onSheetNameChange={sync.setManualSheetName}
              status={sync.status}
              onImport={() => {
                void sync.handleTransfer();
              }}
              onCancel={sync.handleCancelTransfer}
            />
          ),
        },
        {
          id: BACKFILL_LEAF,
          label: 'Backfill',
          subtitle: 'eBay / Ecwid catch-up',
          icon: RefreshCw,
          group: 'assets',
          tone: 'neutral',
          content: (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <AwaitingEbayPanel />
            </div>
          ),
        },
      );
    }

    return rows;
  }, [
    canImportOrders,
    csv.clearError,
    csv.error,
    csv.live,
    csv.open,
    onClose,
    submitNewOrder,
    sync.handleCancelTransfer,
    sync.handleTransfer,
    sync.isTransferring,
    sync.manualSheetName,
    sync.setManualSheetName,
    sync.status,
  ]);

  return (
    <>
      {csv.input}
      {ingestEnabled ? (
        <DetailStackRailRegistrar
          id={ORDER_INGEST_RAIL_ID}
          onClose={onClose}
          modal={false}
          ariaLabel="Add orders"
        >
          <div className="flex h-full min-h-0 flex-col" data-testid="order-ingest-rail">
            <DeskRailChromeRow onClose={onClose} closeTitle="Hide add orders" />
            <DeskInspectorIndexShell
              leaves={leaves}
              activeId={activeId}
              onActiveIdChange={setActiveId}
              ariaLabel="Add order methods"
              testId="order-ingest-inspector"
              backLabel="Back to methods"
              // Unbox Root Index find row + its ↑↓ / Enter keys.
              indexFilter
            />
          </div>
        </DetailStackRailRegistrar>
      ) : null}
      <OrderSyncDialog
        open={sync.isSyncDialogOpen}
        onClose={() => sync.setIsSyncDialogOpen(false)}
        isRunning={sync.isTransferring}
        elapsedMs={sync.elapsedMs}
        onCancel={sync.handleCancelTransfer}
        sheets={sync.sheetsTask}
        ecwid={sync.ecwidTask}
        exceptions={sync.exceptionsTask}
      />
    </>
  );
}
