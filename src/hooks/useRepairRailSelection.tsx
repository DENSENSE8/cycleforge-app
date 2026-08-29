'use client';

/**
 * Repair-queue rail-selection path.
 *
 * Publishes bulk actions into `rail-actions-store` so the right rail owns the
 * selection plane (Unbox History SoT). Do not dual-mount ContextualSelectionBar.
 */

import { useEffect, useMemo } from 'react';
import { Copy, Maximize2 } from '@/components/Icons';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import {
  clearRailActions,
  publishRailActions,
} from '@/lib/right-rail/rail-actions-store';
import { REPAIR_SELECTION_SCOPE } from '@/lib/selection/repair-scopes';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import { repairTicketValue } from '@/lib/repair/repair-grid-layout';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { toast } from '@/lib/toast';

export function useRepairRailSelection(opts: {
  /** Called when the single-row "Open" action fires. */
  onOpenRepair: (repair: RSRecord) => void;
  /** When false, stop publishing (e.g. surface not mounted). */
  publish?: boolean;
}): {
  selectedRows: RSRecord[];
} {
  const { onOpenRepair, publish = true } = opts;
  const selectedRows = useTableSelection<RSRecord>(REPAIR_SELECTION_SCOPE, (r) => r.id);
  const selectableTotal = useTableSelectionTotal(REPAIR_SELECTION_SCOPE);

  const bulkActions = useMemo<SelectionAction<RSRecord>[]>(
    () => [
      {
        key: 'open',
        label: 'Open selected repair',
        icon: <Maximize2 className="h-4 w-4" />,
        primary: true,
        maxSelected: 1,
        run: (rows) => {
          const row = rows[0];
          if (row) onOpenRepair(row);
        },
      },
      {
        key: 'copy-tickets',
        label: 'Copy ticket numbers',
        icon: <Copy className="h-4 w-4" />,
        run: async (rows) => {
          const tickets = rows.map(repairTicketValue).filter(Boolean);
          if (!tickets.length) {
            toast.error('No ticket numbers to copy');
            return;
          }
          try {
            await navigator.clipboard.writeText(tickets.join('\n'));
            toast.success(`Copied ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`);
          } catch {
            toast.error('Failed to copy');
          }
        },
      },
    ],
    [onOpenRepair],
  );

  useEffect(() => {
    if (!publish) {
      clearRailActions(REPAIR_SELECTION_SCOPE);
      return;
    }
    publishRailActions({
      scope: REPAIR_SELECTION_SCOPE,
      rows: selectedRows,
      actions: bulkActions,
      total: selectableTotal,
    });
  }, [publish, selectedRows, bulkActions, selectableTotal]);

  useEffect(() => {
    return () => clearRailActions(REPAIR_SELECTION_SCOPE);
  }, []);

  return { selectedRows };
}
