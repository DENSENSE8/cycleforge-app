'use client';

/** Repair queue host — mounts the repair-queue spreadsheet (`NonlinearTableHost` + the repair table definition) directly. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RSRecord, type RepairTab } from '@/lib/neon/repair-service-queries';
import { RepairRecordView } from './RepairRecordView';
import { RepairRecordStrip } from './repair-record-verbs';
import { DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
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
  // A repair found by `?openRepair=` that the current list does not carry.
  const [fetchedRepair, setFetchedRepair] = useState<RSRecord | null>(null);
  const [repairControlsEl, setRepairControlsEl] = useState<HTMLDivElement | null>(null);

  // URL-backed display sort — `newest` (default) keeps the server `created_at
  // DESC`; a column sort re-orders via the house comparator.
  const { sort, dir, setSort } = useRepairDisplaySort();
  const columnSort = isRepairColumnSort(sort) ? sort : null;

  const {
    data: repairs = [],
    isLoading: loading,
    isFetching: fetching,
    refetch: refetchRepairs,
  } = useRepairsTable(search, filter, searchParams.get('needsLabel') === '1');

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

  // The open repair rides `?openRepair=` — the deep link (printed QR, search)
  // and the plane's state are one param, so reload restores the record.
  const openRaw = Number(searchParams.get('openRepair'));
  const openRepairId = Number.isFinite(openRaw) && openRaw > 0 ? openRaw : null;
  const selectedRepair = openRepairId
    ? (displayRepairs.find((r) => r.id === openRepairId) ??
      (fetchedRepair?.id === openRepairId ? fetchedRepair : null))
    : null;

  const setOpenRepair = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(window.location.search);
      if (id == null) next.delete('openRepair');
      else next.set('openRepair', String(id));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const handleOpen = useCallback((repair: RSRecord) => setOpenRepair(repair.id), [setOpenRepair]);

  useRepairRailSelection({
    onOpenRepair: handleOpen,
  });

  // `?openRepair=` for a repair outside the loaded list — fetch it once.
  useEffect(() => {
    if (openRepairId == null || loading) return;
    if (repairs.some((r) => r.id === openRepairId)) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/repair-service/${openRepairId}`);
        if (!res.ok) return;
        const data = (await res.json()) as RSRecord;
        if (!cancelled && data?.id) setFetchedRepair(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openRepairId, loading, repairs]);

  // D4: closing the record clears the check-set.
  const handleCloseDetails = useCallback(() => {
    setOpenRepair(null);
    emitToggleAll(REPAIR_SELECTION_SCOPE, 'none');
  }, [setOpenRepair]);

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

  // J/K / ↑↓ step the open repair in both record views; the plane owns Esc.
  const cursor = usePublishRecordCursor<RSRecord>({
    surfaceId: 'repair-queue',
    scope: 'record',
    enabled: true,
    order: orderGroupsByDate,
    openId: openRepairId,
    getId: (r) => r.id,
    onOpen: onOpenRow,
    onClose: handleCloseDetails,
  });
  useRecordCursorKeyboard({ enabled: true, scope: 'record', escape: false });
  const stepTo = (id: number | string | undefined) => {
    const row = displayRepairs.find((r) => r.id === Number(id));
    if (row) onOpenRow(row);
  };

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

  const refresh = useCallback(() => {
    void refetchRepairs();
  }, [refetchRepairs]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-surface-canvas">
      <DeskRecordPlane
        open={selectedRepair != null}
        onClose={handleCloseDetails}
        title={selectedRepair ? String(selectedRepair.ticket_number || '').trim() || `RS-${selectedRepair.id}` : ''}
        subtitle={selectedRepair?.product_title ?? undefined}
        indexLabel={cursor.position != null ? `${cursor.position} of ${cursor.total}` : undefined}
        onPrev={() => stepTo(cursor.prev?.id)}
        onNext={() => stepTo(cursor.next?.id)}
        prevDisabled={!cursor.prev}
        nextDisabled={!cursor.next}
        recordNoun="repair"
        recordKey={openRepairId != null ? String(openRepairId) : null}
        testId="repair-record"
        list={
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
              // `search` rides the query key (useRepairs.ts:21) and goes out as `?q=` (:27); the route answers it over the CONTACT joins — customer…
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Filter repairs…',
                answeredBy: 'server',
                pending: fetching,
              }}
              selectionScope={REPAIR_SELECTION_SCOPE}
              actionStrip={
                selectedRepair ? (
                  <RepairRecordStrip key={selectedRepair.id} repair={selectedRepair} onClose={handleCloseDetails} onUpdate={refresh} />
                ) : null
              }
              renderGroup={(group, _stripe, { columns: visible }) =>
                renderRepairLeaf(group.rows[0], visible)
              }
              renderRow={(row, _stripe, { columns: visible }) => renderRepairLeaf(row, visible)}
            />
        }
      >
        {selectedRepair ? (
          <RepairRecordView key={selectedRepair.id} repair={selectedRepair} onUpdate={refresh} />
        ) : null}
      </DeskRecordPlane>

      <RepairRailShell />

    </div>
  );
}
