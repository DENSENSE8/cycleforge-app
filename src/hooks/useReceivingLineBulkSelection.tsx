'use client';

/** Shared bulk-selection for the receiving-line history feeds (left-gutter checkboxes + contextual action bar). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTableSelection } from '@/hooks/useTableSelection';
import { emitToggleAll } from '@/lib/selection/table-selection';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import { printReceivingLineLabels } from '@/lib/receiving/print-receiving-line-labels';
import {
  AlertTriangle,
  Copy,
  MapPin,
  Printer,
  Share2,
  Smartphone,
  TicketHelp,
  Trash2,
  User,
} from '@/components/Icons';
import { ReceivingBulkLocationDialog } from '@/components/receiving/ReceivingBulkLocationDialog';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { receivingShareUrl } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { receivingPackageIds } from '@/lib/receiving/receiving-selection';
import { shareRecordLink } from '@/lib/share-link';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

interface UseReceivingLineBulkSelectionArgs {
  /** table-selection scope shared by the table and the action bar. */
  scope: string;
  /** Whether the selectable surface is currently shown (gates always-on select). */
  active: boolean;
  /** Per-row copy line (the surfaces order their fields differently). */
  formatCopyRow: (row: ReceivingLineRow) => string;
}

export interface ReceivingLineBulkSelection {
  /** Always true while `active` — left-gutter checkboxes stay live. */
  selectMode: boolean;
  selectedRows: ReceivingLineRow[];
  /** Single-line claim row opened from the "Create support ticket" action. */
  claimRow: ReceivingLineRow | null;
  setClaimRow: React.Dispatch<React.SetStateAction<ReceivingLineRow | null>>;
  /** Clear checks (does not turn select mode off — mode follows `active`). */
  exitSelectMode: () => void;
  bulkActions: SelectionAction<ReceivingLineRow>[];
}

function receivingShareTitle(row: ReceivingLineRow): string {
  const identity = row.zoho_purchaseorder_number || row.tracking_number || `Package #${row.receiving_id}`;
  return `Receiving — ${identity}`;
}

async function patchReceivingUrgency(id: number, urgent: boolean): Promise<void> {
  const res = await fetch('/api/receiving-logs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, is_priority: urgent, priority_tier: urgent ? 0 : null }),
  });
  const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !data?.success) throw new Error(data?.error || `Urgency update failed (${res.status})`);
}

export function useReceivingLineBulkSelection({
  scope,
  active,
  formatCopyRow,
}: UseReceivingLineBulkSelectionArgs): ReceivingLineBulkSelection {
  const queryClient = useQueryClient();
  const selectMode = active;
  const selectedRows = useTableSelection<ReceivingLineRow>(scope, (r) => r.id);
  const [claimRow, setClaimRow] = useState<ReceivingLineRow | null>(null);

  const exitSelectMode = useCallback(() => {
    emitToggleAll(scope, 'none');
  }, [scope]);

  // Leaving the selectable surface clears checks so a stale set never lingers.
  useEffect(() => {
    if (!active) exitSelectMode();
  }, [active, exitSelectMode]);

  const handleCopyDetails = useCallback(
    (rows: ReceivingLineRow[]) => {
      const text = rows.map(formatCopyRow).filter(Boolean).join('\n');
      void navigator.clipboard?.writeText(text).then(
        () => toast.success(`Copied ${rows.length} line${rows.length === 1 ? '' : 's'}`),
        () => toast.error('Copy failed'),
      );
    },
    [formatCopyRow],
  );

  const handlePrintLabels = useCallback((rows: ReceivingLineRow[]) => {
    void printReceivingLineLabels(rows);
  }, []);

  const handleShare = useCallback(async (rows: ReceivingLineRow[]) => {
    const packages = new Map<number, ReceivingLineRow>();
    for (const row of rows) {
      if (row.receiving_id != null && row.receiving_id > 0 && !packages.has(row.receiving_id)) {
        packages.set(row.receiving_id, row);
      }
    }
    const entries = [...packages.entries()];
    if (entries.length === 0) return;
    if (entries.length === 1) {
      const [receivingId, row] = entries[0]!;
      await shareRecordLink(receivingShareUrl(receivingId, row.id), receivingShareTitle(row));
      return;
    }
    const links = entries.map(([receivingId, row]) => receivingShareUrl(receivingId, row.id));
    const text = links.join('\n');
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: `${entries.length} receiving packages`, text });
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
    }
    const copied = await copyToClipboard(text, { historyKind: 'link' });
    if (copied) toast.success(`Copied ${entries.length} package links`);
    else toast.error('Could not copy package links');
  }, []);

  const handleSetUrgent = useCallback(
    async (rows: ReceivingLineRow[], resolved?: { direction: 'do' | 'undo' | 'done' }) => {
      const urgent = resolved?.direction !== 'undo';
      const packageIds = receivingPackageIds(rows);
      try {
        await Promise.all(packageIds.map((id) => patchReceivingUrgency(id, urgent)));
        for (const row of rows) {
          dispatchLineUpdated({
            id: row.id,
            is_priority: urgent,
            priority_tier: urgent ? 0 : null,
          });
        }
        invalidateReceivingFeeds(queryClient);
        toast.success(
          `${packageIds.length} package${packageIds.length === 1 ? '' : 's'} ${urgent ? 'marked urgent' : 'cleared from urgent'}`,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not update urgency');
      }
    },
    [queryClient],
  );

  const handleDelete = useCallback(
    async (rows: ReceivingLineRow[]) => {
      const packageIds = receivingPackageIds(rows);
      if (packageIds.length === 0) return;
      const res = await fetch(`/api/receiving-logs?ids=${encodeURIComponent(packageIds.join(','))}`, {
        method: 'DELETE',
      });
      const data = (await res.json().catch(() => null)) as { deleted?: number[]; error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error || `Delete failed (${res.status})`);
        return;
      }
      const deleted = data?.deleted ?? packageIds;
      for (const id of deleted) emitReceiving('receiving-entry-deleted', id);
      invalidateReceivingFeeds(queryClient);
      exitSelectMode();
      toast.success(`${deleted.length} package${deleted.length === 1 ? '' : 's'} deleted`);
    },
    [exitSelectMode, queryClient],
  );

  const bulkActions = useMemo<SelectionAction<ReceivingLineRow>[]>(
    () => [
      {
        key: 'copy',
        label: 'Copy details',
        icon: <Copy className="h-4 w-4" />,
        primary: true,
        run: handleCopyDetails,
      },
      {
        key: 'print',
        label: 'Print labels',
        icon: <Printer className="h-4 w-4" />,
        run: handlePrintLabels,
      },
      {
        key: 'share',
        label: 'Share',
        icon: <Share2 className="h-4 w-4" />,
        tone: 'blue',
        enabled: (rows) => receivingPackageIds(rows).length > 0,
        disabledReason: 'No package is linked to the selected row',
        run: handleShare,
      },
      {
        key: 'urgent',
        label: 'Urgent',
        icon: <AlertTriangle className="h-4 w-4" />,
        tone: 'orange',
        direction: (row) => (row.is_priority || row.priority_tier === 0 ? 'undo' : 'do'),
        directionLabels: { do: 'Mark urgent', undo: 'Clear urgent' },
        enabled: (rows) => receivingPackageIds(rows).length > 0,
        disabledReason: 'No package is linked to the selected row',
        run: handleSetUrgent,
      },
      {
        key: 'location',
        label: 'Change location',
        icon: <MapPin className="h-4 w-4" />,
        enabled: (rows) => receivingPackageIds(rows).length > 0,
        disabledReason: 'No package is linked to the selected row',
        run: () => {},
        dialog: (rows, done) => <ReceivingBulkLocationDialog rows={rows} done={done} />,
      },
      {
        key: 'ticket',
        label: 'Create support ticket',
        icon: <TicketHelp className="h-4 w-4" />,
        maxSelected: 1,
        disabledReason: 'Select a single line to file a ticket',
        run: (rows) => {
          if (rows[0]) setClaimRow(rows[0]);
        },
      },
      {
        key: 'staff',
        label: 'Send to staff',
        icon: <User className="h-4 w-4" />,
        enabled: () => false,
        disabledReason: 'Coming next — needs assignment backend',
        run: () => {
          /* disabled until the backend lands */
        },
      },
      {
        key: 'phone',
        label: 'Send to phone',
        icon: <Smartphone className="h-4 w-4" />,
        enabled: () => false,
        disabledReason: 'Coming next — needs phone push channel',
        run: () => {
          /* disabled until the backend lands */
        },
      },
      {
        key: 'delete',
        label: 'Delete',
        icon: <Trash2 className="h-4 w-4" />,
        tone: 'red',
        enabled: (rows) => receivingPackageIds(rows).length > 0,
        disabledReason: 'No package is linked to the selected row',
        run: handleDelete,
      },
    ],
    [handleCopyDetails, handleDelete, handlePrintLabels, handleSetUrgent, handleShare],
  );

  return {
    selectMode,
    selectedRows,
    claimRow,
    setClaimRow,
    exitSelectMode,
    bulkActions,
  };
}
