'use client';

import { AnimatePresence } from '@/design-system/motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Copy, Maximize2 } from '../Icons';
import { RSRecord, type RepairTab } from '@/lib/neon/repair-service-queries';
import { RepairDetailsPanel } from './RepairDetailsPanel';
import { RepairGridView } from './repair-grid/RepairGridView';
import { useRepairsTable } from '@/hooks/useRepairs';
import { useRepairDisplaySort } from '@/hooks/useRepairDisplaySort';
import { isRepairColumnSort } from '@/lib/repair/repair-display-sort';
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';
import { useTableSelection } from '@/hooks/useTableSelection';
import { REPAIR_SELECTION_SCOPE } from '@/lib/selection/repair-scopes';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import { compareRepairGridRows } from '@/lib/repair/repair-grid-compare';
import { repairTicketValue } from '@/lib/repair/repair-grid-layout';
import {
  WORKBENCH_CHROME_COLUMN,
  WORKBENCH_GUTTERS,
} from '@/components/dashboard/workbench-shell';
import { RepairWorkspaceHeader } from './RepairWorkspaceHeader';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

interface RepairTableProps {
  filter: RepairTab;
}

/**
 * Repair queue host — thin composer for the {@link RepairGridView} spreadsheet.
 * Owns fetch, the open (detail-panel) record + keyboard move, the `?openRepair=`
 * deep-link, the repair-scoped bulk-selection bar, and the workbench chrome.
 * Sort is URL-backed (`?sort=`/`?dir=`, {@link useRepairDisplaySort}) so the
 * top-bar dropdown and the grid header clicks share one state (dashboard
 * parity). Per-row Print / Square-pay live in `RepairDetailsPanel`.
 */
export function RepairTable({ filter }: RepairTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.get('search');
  const [selectedRepair, setSelectedRepair] = useState<RSRecord | null>(null);

  // URL-backed display sort — `newest` (default) keeps the server `created_at
  // DESC`; a column sort re-orders via the house comparator.
  const { sort, dir, setSort } = useRepairDisplaySort();
  const columnSort = isRepairColumnSort(sort) ? sort : null;

  const {
    data: repairs = [],
    isLoading: loading,
    refetch: refetchRepairs,
  } = useRepairsTable(search, filter);

  const displayRepairs = useMemo(
    () =>
      columnSort && dir
        ? [...repairs].sort((a, b) => compareRepairGridRows(a, b, columnSort, dir))
        : repairs,
    [repairs, columnSort, dir],
  );

  /** Open RepairDetailsPanel when landing from a printed repair QR (`?openRepair=`). */
  useEffect(() => {
    const raw = searchParams.get('openRepair');
    if (!raw) return;
    const openId = parseInt(raw, 10);
    if (!Number.isFinite(openId) || openId <= 0) return;
    if (loading) return;

    let cancelled = false;

    const run = async () => {
      const fromList = repairs.find((r) => r.id === openId);
      if (fromList) {
        if (!cancelled) setSelectedRepair(fromList);
      } else {
        try {
          const res = await fetch(`/api/repair-service/${openId}`);
          if (!res.ok) return;
          const data = (await res.json()) as RSRecord;
          if (!cancelled && data?.id) setSelectedRepair(data);
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return;
      const next = new URLSearchParams(searchParams.toString());
      if (!next.has('openRepair')) return;
      next.delete('openRepair');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loading, pathname, repairs, router, searchParams]);

  const handleOpen = useCallback((repair: RSRecord) => setSelectedRepair(repair), []);
  const handleCloseDetails = useCallback(() => setSelectedRepair(null), []);

  // Keyboard move up/down walks the DISPLAYED order (matches the grid).
  const selectedIndex = selectedRepair
    ? displayRepairs.findIndex((r) => r.id === selectedRepair.id)
    : -1;
  const handleMoveUp = useCallback(() => {
    if (selectedIndex > 0) setSelectedRepair(displayRepairs[selectedIndex - 1]);
  }, [selectedIndex, displayRepairs]);
  const handleMoveDown = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < displayRepairs.length - 1) {
      setSelectedRepair(displayRepairs[selectedIndex + 1]);
    }
  }, [selectedIndex, displayRepairs]);

  // ── Bulk selection (minimal, non-destructive) ─────────────────────────────
  const selectedRows = useTableSelection<RSRecord>(REPAIR_SELECTION_SCOPE, (r) => r.id);
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
          if (row) setSelectedRepair(row);
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
    [],
  );

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-surface-canvas">
      <div className={`relative z-header shrink-0 ${WORKBENCH_CHROME_COLUMN}`}>
        <RepairWorkspaceHeader />
      </div>
      {/* Grid gutter column — the grid's own TABLE_SURFACE_CLIP is the single
          card (no DateRangeHeader band, no nested card wrapper). */}
      <div className={cn(WORKBENCH_GUTTERS, 'relative flex min-h-0 min-w-0 flex-1 flex-col pb-4 pt-3')}>
        <RepairGridView
          records={displayRepairs}
          loading={loading}
          emptyMessage={search ? `No repairs match "${search}"` : 'No repairs found'}
          selectionScope={REPAIR_SELECTION_SCOPE}
          selectedId={selectedRepair?.id ?? null}
          onOpenRecord={handleOpen}
          sort={columnSort}
          dir={dir}
          onSortChange={(key, nextDir) => {
            if (isRepairColumnSort(key)) setSort(key, nextDir);
          }}
        />
        <ContextualSelectionBar
          scope={REPAIR_SELECTION_SCOPE}
          rows={selectedRows}
          actions={bulkActions}
        />
      </div>

      <AnimatePresence>
        {selectedRepair && (
          <RepairDetailsPanel
            repair={selectedRepair}
            onClose={handleCloseDetails}
            onUpdate={() => {
              void refetchRepairs();
            }}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            disableMoveUp={selectedIndex <= 0}
            disableMoveDown={selectedIndex < 0 || selectedIndex >= displayRepairs.length - 1}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
