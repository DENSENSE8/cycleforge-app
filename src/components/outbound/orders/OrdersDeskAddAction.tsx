'use client';

/**
 * To-ship's intake CTA on the desk chrome's tab band.
 * on the industrial bar (To ship, owner 2026-09-24), where it sits flush
 * (operator, 2026-08-31): the CTA already listed the methods, so the rail was a
 * Operator direction (2026-08-31 / 2026-09-01). The desk's dominant intake is
 */

import { useMemo } from 'react';
import { FileText, Plus, RefreshCw, Download, ExternalLink, Play } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  useDeskExportMenuAction,
} from '@/design-system/components/DeskActionSlot';
import { DeskHeaderSplitAction } from '@/design-system/components/DeskHeaderSplitAction';
import { useToShipPlatformSyncMenu } from '@/components/outbound/orders/useToShipPlatformSyncMenu';

/**
 * What the CTA runs directly.
 * host does the work (operator, 2026-08-31).
 * demoed without touching production orders (operator 2026-09-15).
 */
export type OrderIntakeMethod = 'file' | 'sync' | 'demo' | 'test';

export function OrdersDeskAddAction({
  onAdd,
  onMethod,
  canImport = true,
  syncing = false,
  syncProgressLabel = null,
}: {
  /** The acknowledgment intake for ONE order (`?triage=new`). */
  onAdd: () => void;
  /** Run a bulk method on the desk — sync now, or open the CSV picker. */
  onMethod: (method: OrderIntakeMethod) => void;
  /** `orders.import` (and a live import descriptor) — hides the CSV item. */
  canImport?: boolean;
  /** A sync is already running; the face reports it rather than starting a second. */
  syncing?: boolean;
  /**
   * Live position in the run ledger ("3/8 · 128 rows"). The face is the first
   * place the operator looks after pressing, so it says how far along the run
   * is rather than an indefinite "Syncing…".
   */
  syncProgressLabel?: string | null;
}) {
  const platformMenu = useToShipPlatformSyncMenu();
  const exportAction = useDeskExportMenuAction();

  // Memoized: the registrar re-registers whenever this node's identity changes,
  // and a fresh element every render would loop through the provider.
  const control = useMemo(
    () => (
      <div className="flex shrink-0" data-testid="orders-desk-add">
      <DeskHeaderSplitAction
        tone="blue"
        icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
        label={syncing ? (syncProgressLabel ?? 'Syncing…') : 'Sync ShipStation'}
        loading={syncing}
        onClick={() => onMethod('sync')}
        menuPlacement="bottom"
        menuChrome="dropdown"
        menuLabel="More intake methods"
        menu={[
          ...platformMenu.map((row) => ({
            label: row.label,
            icon:
              row.kind === 'more' ? (
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              ),
            onClick: row.onClick,
            disabled: row.disabled,
            separatorBefore: row.separatorBefore,
          })),
          ...(canImport
            ? [
                {
                  label: 'Upload orders CSV',
                  icon: <FileText aria-hidden className="h-3.5 w-3.5" />,
                  onClick: () => onMethod('file'),
                  separatorBefore: true,
                },
              ]
            : []),
          ...(exportAction
            ? [
                {
                  label: exportAction.empty
                    ? 'Export to CSV'
                    : `Export ${exportAction.rowCount} rows to CSV`,
                  icon: <Download aria-hidden className="h-3.5 w-3.5" />,
                  onClick: exportAction.run,
                  disabled: exportAction.empty,
                  separatorBefore: !canImport,
                },
              ]
            : []),
          {
            label: 'Add one order (review first)',
            icon: <Plus aria-hidden className="h-3.5 w-3.5" />,
            onClick: onAdd,
            separatorBefore: true,
          },
          {
            label: 'Add test order',
            icon: <Plus aria-hidden className="h-3.5 w-3.5" />,
            onClick: () => onMethod('test'),
            separatorBefore: true,
          },
          {
            label: 'Demo sync (sample data)',
            icon: <Play aria-hidden className="h-3.5 w-3.5" />,
            onClick: () => onMethod('demo'),
            separatorBefore: true,
          },
        ]}
        className="shrink-0"
      />
      </div>
    ),
    [onAdd, onMethod, canImport, syncing, syncProgressLabel, platformMenu, exportAction],
  );

  return <DeskActionSlotRegistrar>{control}</DeskActionSlotRegistrar>;
}
