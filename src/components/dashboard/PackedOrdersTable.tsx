'use client';

/**
 * Dashboard · Packed — first-class staged queue (PACK event, no dock scan-out).
 * Uses `/api/orders?stagedOnly=true` via {@link packedOrdersQuery}, not a client
 * filter of the shipped week packerlogs dataset.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { OrdersQueueTable } from '@/components/dashboard/OrdersQueueTable';
import { packedOrdersQuery } from '@/lib/queries/dashboard-queries';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { dispatchOpenShippedDetails, dispatchCloseShippedDetails } from '@/utils/events';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';
import { ColumnConfigButton } from '@/components/ui/table-column-config/ColumnConfigButton';
import { BoardSelectToggle } from '@/components/board/BoardSelectToggle';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { ToolbarControlsDisclosure } from '@/components/ui/ToolbarControlsDisclosure';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { createPortal } from 'react-dom';
import { useEventBridge } from '@/hooks';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { useOutboundQueueKeyboard } from '@/hooks/useOutboundQueueKeyboard';
import { PACKED_SAVED_VIEWS_KEY, PACKED_VIEW_PARAMS } from '@/components/unshipped/outbound-sidebar-shared';
import type { ShippedOrder } from '@/types/orders';

export interface PackedOrdersTableProps {
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  toolbarPortalTarget?: HTMLElement | null;
}

export function PackedOrdersTable({
  selectMode = false,
  onToggleSelectMode,
  toolbarPortalTarget,
}: PackedOrdersTableProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const searchQuery = String(searchParams.get('search') || '').trim();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const query = useQuery({
    ...packedOrdersQuery({ searchQuery, staffId }),
    placeholderData: (prev, prevQuery) => {
      const prevKey = prevQuery?.queryKey?.[2] as { staffId?: number | null } | undefined;
      if ((prevKey?.staffId ?? null) !== (staffId ?? null)) return undefined;
      return prev;
    },
  });

  useEventBridge({
    'app-refresh-data': () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'packed'] });
    },
    'dashboard-refresh': () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'packed'] });
    },
    'open-shipped-details': (e) => {
      const detail = (e as CustomEvent).detail;
      const id = Number(detail?.order?.id ?? detail?.id);
      setSelectedId(Number.isFinite(id) && id > 0 ? id : null);
    },
    'close-shipped-details': () => setSelectedId(null),
  });

  const records = query.data ?? [];
  const ordered = useMemo(() => records, [records]);

  useOutboundQueueKeyboard({
    enabled: true,
    orderedRecords: ordered,
    selectedId,
    context: 'queue',
    openRecord: (r) => dispatchOpenShippedDetails(r, 'queue'),
  });

  const clearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    const qs = params.toString();
    router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard', {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  const toolbar = (
    <div className="flex items-center gap-2">
      <StaffFilterButton align="start" />
      <ToolbarControlsDisclosure>
        <HoverTooltip label="Configure columns" asChild>
          <span className="inline-flex">
            <ColumnConfigButton variant="toolbar" />
          </span>
        </HoverTooltip>
        {onToggleSelectMode ? (
          <BoardSelectToggle active={selectMode} onToggle={onToggleSelectMode} />
        ) : null}
        <TableOptionsMenu
          showDensity
          showColumnPresets
          savedViews={{ storageKey: PACKED_SAVED_VIEWS_KEY, paramKeys: PACKED_VIEW_PARAMS }}
        />
      </ToolbarControlsDisclosure>
    </div>
  );

  const idleEmpty =
    !query.isLoading && records.length === 0 && !searchQuery ? (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <p className="text-role-caption font-bold text-text-default">Nothing staged</p>
        <p className="max-w-sm text-role-caption text-text-soft">
          Packed orders waiting for dock scan-out land here. Open Scan-out to stage the next package.
        </p>
        <a
          href="/outbound?mode=scan-out"
          className="ds-raw-button rounded-lg bg-blue-600 px-3 py-1.5 text-role-caption font-bold text-white hover:bg-blue-700"
        >
          Open Scan-out
        </a>
      </div>
    ) : undefined;

  return (
    <TableColumnConfigProvider tableId="orders">
      <TableDensityProvider tableId="orders" urlSync={false}>
        {toolbarPortalTarget ? createPortal(toolbar, toolbarPortalTarget) : (
          <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border-soft px-3 py-1.5">
            {toolbar}
          </div>
        )}
        <OrdersQueueTable
          records={records as ShippedOrder[]}
          loading={query.isLoading}
          isRefreshing={query.isFetching && !query.isLoading}
          searchValue={searchQuery}
          onClearSearch={clearSearch}
          emptyMessage="No packed orders"
          firstRunEmpty={idleEmpty}
          searchEmptyTitle="No packed orders found"
          searchResultLabel="packed orders"
          clearSearchLabel="Show All Packed Orders"
          queueMode="staged"
          sort="newest"
          selectMode={selectMode}
          selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
          onOpenRecord={(record) => {
            setSelectedId(Number(record.id));
            dispatchOpenShippedDetails(record, 'queue');
          }}
          onCloseRecord={() => {
            setSelectedId(null);
            dispatchCloseShippedDetails();
          }}
          hideHeader={Boolean(toolbarPortalTarget)}
          noHorizontalScroll
        />
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );
}
