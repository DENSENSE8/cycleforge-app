'use client';

/**
 * Repair queue host — mounts the repair-queue spreadsheet (`NonlinearTableHost`
 * + the repair table definition) directly.
 * Dual-door: Scan Stations `/repair` (task/intake) and Sales `?mode=repairs`
 * (overall history). Same table; surface defaults differ (active vs done).
 * Owns fetch, the open (detail-panel) record + keyboard move, the `?openRepair=`
 * deep-link, rail multi-select (History SoT — no bottom capsule), and workbench chrome.
 * Sort is URL-backed (`?sort=`/`?dir=`, {@link useRepairDisplaySort}) so the
 * top-bar dropdown and the grid header clicks share one state (dashboard
 * parity). Per-row Print / Square-pay live in `RepairDetailsPanel`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RSRecord, type RepairTab } from '@/lib/neon/repair-service-queries';
import { RepairDetailsPanel } from './RepairDetailsPanel';
import { DataTable } from '@/components/tables/DataTable';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import type { RowGroup } from '@/lib/group-rows';
import {
  repairColumnKeyForSort,
  repairSheetColumnsFor,
  repairSortFactFor,
  type RepairGridColumn,
  type RepairGridColumnKey,
} from '@/lib/repair/repair-grid-layout';
import { REPAIR_TABLE_BINDING } from './repair-grid/repair-table-definition';
import { useRepairTableLayout } from './repair-grid/useRepairTableLayout';
import { RepairGridRow } from './repair-grid/RepairGridRow';
import { RepairRailShell } from './rail/RepairRailShell';
import { useRepairsTable } from '@/hooks/useRepairs';
import { useRepairDisplaySort } from '@/hooks/useRepairDisplaySort';
import { useRepairRailSelection } from '@/hooks/useRepairRailSelection';
import { isRepairColumnSort } from '@/lib/repair/repair-display-sort';
import { REPAIR_SELECTION_SCOPE } from '@/lib/selection/repair-scopes';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { compareRepairGridRows } from '@/lib/repair/repair-grid-compare';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';

interface RepairTableProps {
  filter: RepairTab;
}

export function RepairTable({ filter }: RepairTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { searchQuery: search, setSearch } = useWorkbenchSearchParam();
  const [selectedRepair, setSelectedRepair] = useState<RSRecord | null>(null);
  const [repairControlsEl, setRepairControlsEl] = useState<HTMLDivElement | null>(null);

  // URL-backed display sort — `newest` (default) keeps the server `created_at
  // DESC`; a column sort re-orders via the house comparator.
  const { sort, dir, setSort } = useRepairDisplaySort();
  const columnSort = isRepairColumnSort(sort) ? sort : null;

  const {
    data: repairs = [],
    isLoading: loading,
    refetch: refetchRepairs,
  } = useRepairsTable(search, filter);

  // The COLUMNS are the effective slot layout's materialization (staff ?? org
  // ?? product — wave 1.4 hand-model kill). Sort stays the queue's own `?sort=`
  // vocabulary; `repairSortFactFor` maps a mounted track onto one of its words.
  const { effectiveLayout: repairLayout, fields: repairFields } = useRepairTableLayout();
  const columns = useMemo(() => repairSheetColumnsFor(repairLayout), [repairLayout]);

  const displayRepairs = useMemo(
    () =>
      columnSort && dir
        ? [...repairs].sort((a, b) => compareRepairGridRows(a, b, columnSort, dir))
        : repairs,
    [repairs, columnSort, dir],
  );

  const handleOpen = useCallback((repair: RSRecord) => setSelectedRepair(repair), []);

  const { selectedRows } = useRepairRailSelection({
    onOpenRepair: handleOpen,
  });

  // Cardinality decides the body: 1 → inspect panel; 2+ → batch shell (panel off).
  useEffect(() => {
    if (selectedRows.length === 1) {
      const row = selectedRows[0]!;
      setSelectedRepair((prev) => (prev?.id === row.id ? prev : row));
    } else if (selectedRows.length >= 2) {
      setSelectedRepair(null);
    }
  }, [selectedRows]);

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

  // D4: closing the rail clears the check-set.
  const handleCloseDetails = useCallback(() => {
    setSelectedRepair(null);
    emitToggleAll(REPAIR_SELECTION_SCOPE, 'none');
  }, []);

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

  // Grid adapter (was `RepairGridView`): the host mounts here directly. The
  // always-on left gutter (airtable) toggles the shared selection scope; the row
  // body selectOnly + opens the record (one selection channel — History / D3).
  const selectedId = selectedRepair?.id ?? null;
  const { selectedIds, toggle, selectOnly } = useTableSelectMode<RSRecord>({
    scope: REPAIR_SELECTION_SCOPE,
    selectMode: true,
    rows: displayRepairs,
    getId: (r) => r.id,
  });

  // Flat spreadsheet: one synthetic band, each repair a singleton group (no
  // PO/day fold). Row order is `displayRepairs` (server order or column sort).
  const orderGroupsByDate = useMemo<[string, RowGroup<RSRecord>[]][]>(
    () => [['', displayRepairs.map((r) => ({ key: String(r.id), rows: [r] }))]],
    [displayRepairs],
  );

  const onOpenRow = useCallback(
    (r: RSRecord) => {
      selectOnly(r.id);
      handleOpen(r);
    },
    [selectOnly, handleOpen],
  );
  const onToggleSelect = useCallback(
    (r: RSRecord, event: { shiftKey: boolean }) => toggle(r.id, event.shiftKey),
    [toggle],
  );

  const renderRepairLeaf = useCallback(
    (repair: RSRecord, visible: readonly RepairGridColumn[]) => (
      <RepairGridRow
        key={repair.id}
        repair={repair}
        isSelected={selectedId === repair.id}
        isChecked={selectedIds.has(repair.id)}
        onOpen={onOpenRow}
        onToggleSelect={onToggleSelect}
        columns={visible}
      />
    ),
    [selectedId, selectedIds, onOpenRow, onToggleSelect],
  );

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-surface-canvas">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <DataTable<RSRecord, RepairGridColumnKey, RepairGridColumn>
          binding={REPAIR_TABLE_BINDING}
          columns={columns}
          fields={repairFields}
          orderGroupsByDate={orderGroupsByDate}
          rows={displayRepairs}
          getRowId={(r) => String(r.id)}
          sort={repairColumnKeyForSort(columns, columnSort)}
          dir={dir}
          // A header click speaks in TRACK keys; `?sort=` speaks in the
          // queue's own words. Map back through the mounted model so a
          // bookmarked URL keeps its meaning after a rebind.
          onSortChange={(key, nextDir) => {
            const word = repairSortFactFor(
              columns.find((c) => c.key === key) ?? ({ key } as RepairGridColumn),
            );
            if (word && isRepairColumnSort(word)) setSort(word, nextDir);
          }}
          loading={loading}
          emptyMessage={search ? `No repairs match "${search}"` : 'No repairs found'}
          search={{ value: search, onChange: setSearch, placeholder: 'Filter repairs…' }}
          selectionScope={REPAIR_SELECTION_SCOPE}
          renderGroup={(group, _stripe, { columns: visible }) =>
            renderRepairLeaf(group.rows[0], visible)
          }
          renderRow={(row, _stripe, { columns: visible }) => renderRepairLeaf(row, visible)}
        />
      </div>

      <RepairRailShell />

      {selectedRepair ? (
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
      ) : null}
    </div>
  );
}
