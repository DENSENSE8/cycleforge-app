'use client';

/**
 * Testing browse bulk selection for the tech dashboard. Thin wrapper over
 * {@link useReceivingLineRailSelection} (Unbox History SoT) — publishes Copy /
 * Print / Ticket / Assign into `rail-actions-store` so the right rail owns the
 * selection plane. No bottom ContextualSelectionBar.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TESTING_SELECTION_SCOPE } from '@/components/tech/TestingHistoryList';
import { useReceivingLineRailSelection } from '@/hooks/useReceivingLineRailSelection';
import type { ReceivingLineBulkSelection } from '@/hooks/useReceivingLineBulkSelection';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import { User, Check } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { emitToggleAll } from '@/lib/selection/table-selection';

/** Copy line for a tested unit: SKU • serials • PO. */
function formatTestingCopyRow(r: ReceivingLineRow): string {
  const sku = (r.sku || '').trim();
  const serials = (r.serials ?? [])
    .map((s) => (s.serial_number || '').trim())
    .filter(Boolean)
    .join('/');
  const po = (r.zoho_purchaseorder_number || r.zoho_purchaseorder_id || '').trim();
  return [sku && `SKU ${sku}`, serials && `SN ${serials}`, po && `PO ${po}`]
    .filter(Boolean)
    .join(' • ');
}

async function patchAssignedTech(lineId: number, assignedTechId: number): Promise<void> {
  const res = await fetch('/api/receiving-lines', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: lineId, assigned_tech_id: assignedTechId }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error || `Assign failed (${res.status})`);
  }
}

export interface TechTestingSelection {
  testingSelectMode: boolean;
  testingSelectedRows: ReceivingLineRow[];
  testingClaimRow: ReceivingLineRow | null;
  setTestingClaimRow: ReceivingLineBulkSelection['setClaimRow'];
  /** Rows waiting on the Assign-to… picker dialog. */
  testingAssignRows: ReceivingLineRow[] | null;
  setTestingAssignRows: React.Dispatch<React.SetStateAction<ReceivingLineRow[] | null>>;
  /** Apply an assignment (used by Assign to me + the picker confirm). */
  assignTestingLines: (rows: ReceivingLineRow[], techId: number) => Promise<void>;
  exitTestingSelect: () => void;
  /** History row already opens via `dispatchSelectLine`; no URL hop needed. */
  openTestingLine: () => void;
  testingBulkActions: ReceivingLineBulkSelection['bulkActions'];
}

export function useTechTestingSelection(
  /** True when Testing top-mode is active and no line panel is open. */
  browseActive: boolean,
  /** Signed-in technician id — powers one-tap "Assign to me." */
  ownTechId: number | null,
): TechTestingSelection {
  const queryClient = useQueryClient();
  const [assignRows, setAssignRows] = useState<ReceivingLineRow[] | null>(null);

  const assignTestingLines = useCallback(
    async (rows: ReceivingLineRow[], techId: number) => {
      if (rows.length === 0 || !(techId > 0)) return;
      const ids = new Set(rows.map((r) => r.id));

      // Optimistic: stamp assigned_tech_id on every cached testing-workspace feed
      // so Mine / All swap without waiting on the round-trip.
      queryClient.setQueriesData<{ receiving_lines?: ReceivingLineRow[] }>(
        { queryKey: ['testing-workspace'] },
        (prev) => {
          if (!prev || !Array.isArray(prev.receiving_lines)) return prev;
          return {
            ...prev,
            receiving_lines: prev.receiving_lines.map((row) =>
              ids.has(row.id) ? { ...row, assigned_tech_id: techId } : row,
            ),
          };
        },
      );

      const results = await Promise.allSettled(
        rows.map((row) => patchAssignedTech(row.id, techId)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = results.length - failed;
      if (ok > 0) {
        toast.success(
          failed > 0
            ? `Assigned ${ok} of ${results.length} lines`
            : `Assigned ${ok} line${ok === 1 ? '' : 's'}`,
        );
      }
      if (failed > 0 && ok === 0) {
        toast.error('Could not assign the selected lines');
      }
      await queryClient.invalidateQueries({ queryKey: ['testing-workspace'] });
      emitToggleAll(TESTING_SELECTION_SCOPE, 'none');
      setAssignRows(null);
    },
    [queryClient],
  );

  const mapActions = useCallback(
    (actions: SelectionAction<ReceivingLineRow>[]) => {
      // Drop the shared stub "Send to staff" — Testing owns a real assign path.
      const base = actions.filter((a) => a.key !== 'staff');
      const assignToMe: SelectionAction<ReceivingLineRow> = {
        key: 'assign-me',
        label: 'Assign to me',
        icon: <Check className="h-4 w-4" />,
        tone: 'blue',
        enabled: () => ownTechId != null && ownTechId > 0,
        disabledReason: 'Sign in as a technician to claim lines',
        run: (rows) => {
          if (ownTechId == null || ownTechId <= 0) return;
          void assignTestingLines(rows, ownTechId);
        },
      };
      const assignTo: SelectionAction<ReceivingLineRow> = {
        key: 'assign',
        label: 'Assign to…',
        icon: <User className="h-4 w-4" />,
        run: (rows) => {
          setAssignRows(rows);
        },
      };
      return [...base, assignToMe, assignTo];
    },
    [ownTechId, assignTestingLines],
  );

  const {
    selectMode,
    selectedRows,
    claimRow,
    setClaimRow,
    exitSelectMode,
    bulkActions,
  } = useReceivingLineRailSelection({
    scope: TESTING_SELECTION_SCOPE,
    active: browseActive,
    formatCopyRow: formatTestingCopyRow,
    // Claim / assign modal exclusivity is enforced by disabling
    // ReceivingLineRailShell in TechDashboard (R7). Publish stays up so closing
    // restores actions.
    publish: browseActive,
    mapActions,
  });

  const openTestingLine = useCallback(() => {
    // Row click in TestingHistoryList already dispatches `receiving-select-line`.
  }, []);

  return {
    testingSelectMode: selectMode,
    testingSelectedRows: selectedRows,
    testingClaimRow: claimRow,
    setTestingClaimRow: setClaimRow,
    testingAssignRows: assignRows,
    setTestingAssignRows: setAssignRows,
    assignTestingLines,
    exitTestingSelect: exitSelectMode,
    openTestingLine,
    testingBulkActions: bulkActions,
  };
}
