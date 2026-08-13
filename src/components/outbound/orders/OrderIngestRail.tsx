'use client';

/**
 * To-ship ingest picker — Add / Import methods as Unbox Displays index→leaf.
 *
 * Band 1 is one Add control. Methods live here, not in a chrome dropdown.
 * Compose {@link DeskInspectorIndexShell} (never a page-local index twin;
 * never `StationDisplaysPushStack` on the desk rail).
 */

import { useEffect, useMemo, useState } from 'react';
import { Database, FileText, Globe, Loader2, Plus, RefreshCw } from '@/components/Icons';
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
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';
import { AwaitingEbayPanel } from '@/components/unshipped/AwaitingEbayPanel';
import { SearchableSelectField } from '@/design-system/components';
import { Button, TextField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { useOrdersSync } from '@/hooks/useOrdersSync';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import { cn } from '@/utils/_cn';

const ORDER_INGEST_RAIL_ID = 'detail:order-ingest';

const MANUAL_LEAF = 'manual';
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
  /** `manual` lands on the form (`?new=true`); otherwise Root Index. */
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

  const ingestEnabled = open && !importActive;

  const leaves = useMemo((): DeskInspectorLeaf[] => {
    const rows: DeskInspectorLeaf[] = [
      {
        id: MANUAL_LEAF,
        label: 'Add order manually',
        subtitle: 'Replacement or new order',
        icon: Plus,
        group: 'context',
        tone: 'neutral',
        content: (
          <ShippedIntakeForm embedded onClose={onClose} onSubmit={submitNewOrder} />
        ),
      },
      {
        id: PLATFORM_LEAF,
        label: 'Add from platform',
        subtitle: 'Search the channel catalog',
        icon: Globe,
        group: 'context',
        tone: 'neutral',
        content: <PlatformAddLeaf onClose={onClose} />,
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
            <FileImportLeaf
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
            <SyncImportLeaf
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

function PlatformAddLeaf({ onClose }: { onClose: () => void }) {
  const submitNewOrder = useShippedFormSubmit(onClose);
  const { options } = usePlatformCatalog();
  const [platform, setPlatform] = useState<string | null>(null);

  const selectOptions = useMemo(
    () =>
      options.map((o) => ({
        value: o.value,
        label: o.label,
        group: 'Platforms',
      })),
    [options],
  );

  const selectedLabel = options.find((o) => o.value === platform)?.label ?? '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SearchableSelectField
        appearance="flush"
        label="Platform"
        autoFocus
        value={platform}
        onChange={(id) => {
          if (id == null) {
            setPlatform(null);
            return;
          }
          setPlatform(String(id));
        }}
        options={selectOptions}
        placeholder="Search or select…"
        searchPlaceholder="Type to filter…"
        emptyMessage="No platforms match"
        ariaLabel="Platform"
      />
      {platform ? (
        <ShippedIntakeForm
          embedded
          hideModeTabs
          initialTab="add_order"
          accountSource={selectedLabel || undefined}
          onClose={onClose}
          onSubmit={submitNewOrder}
        />
      ) : (
        <p className="px-4 py-3 text-role-caption text-text-soft">
          Pick a platform, then enter the order.
        </p>
      )}
    </div>
  );
}

function FileImportLeaf({
  error,
  onClearError,
  onChoose,
}: {
  error: string | null;
  onClearError: () => void;
  onChoose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-border-hairline px-4 py-3 text-role-caption text-text-soft">
        Opens desk staging — triage Ready / Action required, then confirm into To-ship.
      </p>
      <div className="px-4 py-3">
        <Button
          variant="primary"
          size="sm"
          icon={<FileText className="h-3.5 w-3.5" />}
          onClick={onChoose}
          className={cn('font-semibold')}
          data-testid="order-ingest-choose-csv"
        >
          Choose CSV
        </Button>
      </div>
      {error ? (
        <p className="px-4 py-2 text-role-caption text-rose-700" role="alert">
          {error}{' '}
          <button type="button" className="underline" onClick={onClearError}>
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}

function SyncImportLeaf({
  isTransferring,
  manualSheetName,
  onSheetNameChange,
  status,
  onImport,
  onCancel,
}: {
  isTransferring: boolean;
  manualSheetName: string;
  onSheetNameChange: (next: string) => void;
  status: { type: 'success' | 'error'; message: string } | null;
  onImport: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="divide-y divide-border-hairline border-b border-border-hairline">
        <TextField
          appearance="flush"
          label="Sheet name (optional)"
          value={manualSheetName}
          onChange={onSheetNameChange}
          disabled={isTransferring}
          mono
        />
      </div>
      <div className="px-4 py-3">
        {isTransferring ? (
          <Button
            variant="danger"
            size="sm"
            icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
            onClick={onCancel}
            className="font-semibold"
          >
            Cancel import
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon={<Database className="h-3.5 w-3.5" />}
            onClick={onImport}
            className="font-semibold"
            data-testid="order-ingest-import-latest"
          >
            Import latest orders
          </Button>
        )}
      </div>
      {status ? (
        <p
          className={cn(
            'px-4 py-2 text-role-caption',
            status.type === 'success' ? 'text-emerald-700' : 'text-rose-700',
          )}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
