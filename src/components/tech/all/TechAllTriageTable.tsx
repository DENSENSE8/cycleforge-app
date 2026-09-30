'use client';

/**
 * Tech All triage table — typed cross-queue priority list on `/test` and `/unbox`.
 * Flush sheet host body (Unbox recipe). Opens by type: line focus, shipping
 * order details, or deep-link to /repair · /pickup.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { PickupLine } from '@/lib/receiving/pickup/pickup-lines';
import { pickupLineNeedsProcess } from '@/lib/local-pickup/order-status';
import { QC_RECEIVING_LINES_API } from '@/lib/surface-isolation';
import { unshippedOrdersQuery } from '@/lib/queries/dashboard-queries';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { ShippedOrder } from '@/types/orders';
import { dispatchOpenShippedDetails } from '@/utils/events';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import {
  mergeTechAllTriageRows,
  type TechAllTriageRow,
  type TechAllTriageScope,
} from '@/lib/tech/tech-all-triage';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  defaultDirForTechAllColumn,
  isTechAllColumnSortable,
  techAllSheetColumnsFor,
  techAllSortFactFor,
  type TechAllGridColumn,
  type TechAllGridColumnKey,
} from '@/lib/tech/tech-all-grid-layout';
import { TECH_ALL_TABLE_BINDING } from './tech-all-table-definition';
import { TechAllGridRow } from './TechAllGridRow';
import { useTechAllTableLayout } from './useTechAllTableLayout';

/** Row order for a column sort, keyed by SORT FACT — the structural `identity` plus catalog field ids (`techAllSortFactFor` maps a mounted… */
function compareTechAllRows(
  a: TechAllTriageRow,
  b: TechAllTriageRow,
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (fact) {
    case 'identity':
      return sign * a.title.localeCompare(b.title);
    case 'tech-all.item':
      return sign * a.id.localeCompare(b.id);
    case 'tech-all.type':
      return sign * a.typeLabel.localeCompare(b.typeLabel);
    case 'tech-all.stage':
      return sign * a.stage.localeCompare(b.stage);
    case 'tech-all.urgency':
      return sign * (a.urgencyRank - b.urgencyRank);
    default:
      return 0;
  }
}

interface TechAllTriageTableProps {
  scope: TechAllTriageScope;
  /** Testing / Unbox: open focused line in the station workspace. */
  onOpenTestingLine?: (row: ReceivingLineRow) => void;
  /** Unbox: open focused line in UnboxLineWorkspace (preferred over testing). */
  onOpenUnboxLine?: (row: ReceivingLineRow) => void;
  /** The desk's mode strip, drawn on this table's own bottom bar. */
}

async function fetchNeedsTestLines(): Promise<ReceivingLineRow[]> {
  const params = new URLSearchParams({
    limit: '500',
    offset: '0',
    include: 'serials',
    view: 'needs-test',
    return_scope: 'all',
  });
  const res = await fetch(`${QC_RECEIVING_LINES_API}?${params.toString()}`);
  if (!res.ok) throw new Error('testing lines fetch failed');
  const data = (await res.json()) as { receiving_lines?: ReceivingLineRow[] };
  return Array.isArray(data.receiving_lines) ? data.receiving_lines : [];
}

async function fetchUnboxQueueLines(): Promise<ReceivingLineRow[]> {
  const params = new URLSearchParams({
    limit: '500',
    offset: '0',
    include: 'serials',
    view: 'scanned',
    sort: 'priority',
  });
  const res = await fetch(`/api/receiving-lines?${params.toString()}`);
  if (!res.ok) throw new Error('unbox queue fetch failed');
  const data = (await res.json()) as { receiving_lines?: ReceivingLineRow[] };
  return Array.isArray(data.receiving_lines) ? data.receiving_lines : [];
}

async function fetchActiveRepairs(): Promise<RSRecord[]> {
  const res = await fetch('/api/repair-service?tab=active&limit=200');
  if (!res.ok) throw new Error('repair fetch failed');
  const data = (await res.json()) as { rows?: RSRecord[] };
  return Array.isArray(data.rows) ? data.rows : [];
}

async function fetchPickupLines(): Promise<PickupLine[]> {
  const res = await fetch('/api/local-pickup-orders/lines?limit=500', { cache: 'no-store' });
  if (!res.ok) throw new Error('pickup fetch failed');
  const data = (await res.json()) as { lines?: PickupLine[] };
  const lines = Array.isArray(data.lines) ? data.lines : [];
  return lines.filter((l) => pickupLineNeedsProcess(l) || l.order_status !== 'COMPLETED');
}

export function TechAllTriageTable({
  scope,
  onOpenTestingLine,
  onOpenUnboxLine,
}: TechAllTriageTableProps) {
  const router = useRouter();
  const { searchQuery, setSearch } = useWorkbenchSearchParam();

  const needsTestQuery = useQuery({
    queryKey: ['tech-all-triage', 'needs-test'],
    queryFn: fetchNeedsTestLines,
    enabled: scope === 'testing',
    staleTime: 20_000,
  });

  const unboxQueueQuery = useQuery({
    queryKey: ['tech-all-triage', 'unbox-queue'],
    queryFn: fetchUnboxQueueLines,
    enabled: scope === 'unbox',
    staleTime: 20_000,
  });

  const ordersQuery = useQuery({
    ...unshippedOrdersQuery({ limit: 200 }),
    enabled: scope === 'shipping' || scope === 'testing',
    staleTime: 60_000,
  });

  const repairsQuery = useQuery({
    queryKey: ['tech-all-triage', 'repairs-active'],
    queryFn: fetchActiveRepairs,
    staleTime: 30_000,
  });

  const pickupQuery = useQuery({
    queryKey: ['tech-all-triage', 'pickup-lines'],
    queryFn: fetchPickupLines,
    staleTime: 30_000,
  });

  const orders = useMemo((): ShippedOrder[] => {
    const raw = ordersQuery.data;
    return Array.isArray(raw) ? raw : [];
  }, [ordersQuery.data]);

  const receivingLines =
    scope === 'unbox' ? unboxQueueQuery.data : needsTestQuery.data;

  const rows = useMemo(
    () =>
      mergeTechAllTriageRows({
        scope,
        receivingLines,
        orders,
        repairs: repairsQuery.data,
        pickupLines: pickupQuery.data,
        search: searchQuery,
      }),
    [
      scope,
      receivingLines,
      orders,
      repairsQuery.data,
      pickupQuery.data,
      searchQuery,
    ],
  );

  const loading =
    (scope === 'testing' && needsTestQuery.isLoading) ||
    (scope === 'unbox' && unboxQueueQuery.isLoading) ||
    ((scope === 'shipping' || scope === 'testing') && ordersQuery.isLoading) ||
    repairsQuery.isLoading ||
    pickupQuery.isLoading;

  const onOpen = useCallback(
    (row: TechAllTriageRow) => {
      switch (row.ref.kind) {
        case 'receiving_line':
          dispatchSelectLine(row.ref.row);
          if (scope === 'unbox') {
            onOpenUnboxLine?.(row.ref.row);
          } else {
            onOpenTestingLine?.(row.ref.row);
          }
          return;
        case 'order':
          dispatchOpenShippedDetails(row.ref.order, 'queue');
          return;
        case 'repair':
          router.push(`/repair?openRepair=${row.ref.repairId}`);
          return;
        case 'pickup':
          router.push(`/pickup?lcpu=${row.ref.orderId}`);
          return;
      }
    },
    [onOpenTestingLine, onOpenUnboxLine, router, scope],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  // The COLUMNS are the effective slot layout's materialization (staff ?? org
  // ?? product — wave 1.4 hand-model kill). Sort keys are the mounted track
  // keys; each resolves to its bound field's fact through `techAllSortFactFor`.
  const { effectiveLayout: techAllLayout, fields: techAllFields } = useTechAllTableLayout();
  const columns = useMemo(() => techAllSheetColumnsFor(techAllLayout), [techAllLayout]);
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, techAllSortFactFor(c)])),
    [columns],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<TechAllGridColumnKey>({
    isColumn: (raw) => isTechAllColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForTechAllColumn(columns, key),
  });

  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo(() => {
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    const ordered =
      sortFact && sortDir
        ? [...rows].sort((a, b) => compareTechAllRows(a, b, sortFact, sortDir))
        : rows;
    const groups: RowGroup<TechAllTriageRow>[] = ordered.map((row) => ({ key: row.id, rows: [row] }));
    return [['', groups]] as [string, RowGroup<TechAllTriageRow>[]][];
  }, [rows, columnSort, sortDir]);

  const emptyMessage = 'Nothing to triage';

  return (
    <DataTable<TechAllTriageRow, TechAllGridColumnKey, TechAllGridColumn>
      binding={TECH_ALL_TABLE_BINDING}
      columns={columns}
      fields={techAllFields}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => r.id}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      emptyState={
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-1 px-4 py-10 text-center">
          <p className="text-role-body font-medium text-text-default">{emptyMessage}</p>
          <p className="text-role-caption text-text-soft">
            All — prioritize across types. Queues are clear for this scope.
          </p>
        </div>
      }
      searchEmptyMessage="No matches for this search"
      scrollRef={scrollRef}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <TechAllGridRow key={group.rows[0].id} row={group.rows[0]} onOpen={onOpen} columns={visible} />
      )}
      renderRow={(row, _stripe, { columns: visible }) => (
        <TechAllGridRow row={row} onOpen={onOpen} columns={visible} />
      )}
    />
  );
}
