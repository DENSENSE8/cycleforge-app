'use client';

/** Shared bulk-selection for the receiving-line history feeds (left-gutter checkboxes + contextual action bar). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTableSelection } from '@/hooks/useTableSelection';
import { emitToggleAll } from '@/lib/selection/table-selection';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import { printReceivingLineLabels } from '@/lib/receiving/print-receiving-line-labels';
import { Copy, Printer, TicketHelp, User, Smartphone } from '@/components/Icons';
import { toast } from '@/lib/toast';
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

export function useReceivingLineBulkSelection({
  scope,
  active,
  formatCopyRow,
}: UseReceivingLineBulkSelectionArgs): ReceivingLineBulkSelection {
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

  const bulkActions = useMemo<SelectionAction<ReceivingLineRow>[]>(
    () => [
      {
        key: 'copy',
        label: 'Copy details',
        icon: <Copy className="h-4 w-4" />,
        tone: 'blue',
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
    ],
    [handleCopyDetails, handlePrintLabels],
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
