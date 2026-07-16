'use client';

/**
 * Shipping-mode sidebar rail — same deduped History feed as the History tab
 * (`useShippingHistoryFeedOptional` when inside TechPageContent, else local
 * `useTechLogs` — desktop sidebar renders outside the provider).
 * anatomy. Selecting a row opens Shipping preview for serial/tracking edits.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import type { SidebarRailRowContext } from '@/components/sidebar/SidebarRailShell';
import { dispatchUpNextPreview, type UpNextPreviewPayload } from '@/utils/events';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import { useTechLogs, type TechRecord } from '@/hooks/useTechLogs';
import { useShippingHistoryFeedOptional } from '@/hooks/station/ShippingHistoryFeedProvider';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import { dedupeTechRecords } from '@/lib/station/dedupe-tech-records';
import { computeWeekRange } from '@/utils/date';
import {
  getTechRecordStatusDot,
  getTechRecordStatusDotLabel,
  filterTechRecordRailRows,
  techRecordToRailVM,
} from '@/components/station/tech-record-rail-vm';
import {
  SHIPPING_RAIL_REFRESH_EVENTS,
  techRecordRailId,
  techRecordToPreviewOrder,
} from './shipping-rail-shared';

interface Props {
  /** Signed-in staff id — fallback when `?staff=` is absent. */
  techId: string;
  /** Client-side filter over the loaded history rows. */
  filterText?: string;
}

const getRowActivityAt = (row: TechRecord) => row.created_at;

function useShippedRailSelection(): number | null {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  useEffect(() => {
    const handlePreview = (e: Event) => {
      const detail = (e as CustomEvent<UpNextPreviewPayload>).detail;
      setSelectedOrderId(detail && detail.kind === 'order' ? detail.order.id : null);
    };
    const handleActive = (e: Event) => {
      const detail = (e as CustomEvent<{ activeOrder: ActiveStationOrder } | null>).detail;
      if (detail) setSelectedOrderId(null);
    };
    const handleCloseDetails = () => setSelectedOrderId(null);
    window.addEventListener('tech-upnext-preview', handlePreview);
    window.addEventListener('tech-active-order-changed', handleActive);
    window.addEventListener('close-shipped-details', handleCloseDetails);
    return () => {
      window.removeEventListener('tech-upnext-preview', handlePreview);
      window.removeEventListener('tech-active-order-changed', handleActive);
      window.removeEventListener('close-shipped-details', handleCloseDetails);
    };
  }, []);
  return selectedOrderId;
}

function HistoryRowMain({
  row,
}: {
  row: TechRecord;
  ctx: SidebarRailRowContext;
}) {
  return <RailRowBody className="flex-1" vm={techRecordToRailVM(row)} />;
}

export function ShippingStaffShippedRail({ techId, filterText = '' }: Props) {
  const trimmedFilter = filterText.trim();
  const selectedOrderId = useShippedRailSelection();
  const sharedFeed = useShippingHistoryFeedOptional();

  const parsedTechId = Number(techId);
  const sessionStaffId = Number.isFinite(parsedTechId) && parsedTechId > 0 ? parsedTechId : 0;
  const { staffId: urlStaffId } = useStaffFilter({ allToken: 'all' });
  const searchParams = useSearchParams();
  const rawStaff = searchParams.get(STAFF_FILTER_PARAM);
  const wantAllExplicit = String(rawStaff || '').trim().toLowerCase() === 'all';
  const localStaffId = wantAllExplicit ? 'all' : (urlStaffId ?? sessionStaffId);

  const localWeekRange = useMemo(() => computeWeekRange(0), []);
  const { data: localRecords = [], isLoading: localLoading } = useTechLogs(localStaffId, {
    weekOffset: 0,
    weekRange: localWeekRange,
    enabled: sharedFeed == null,
  });
  const localRecordsDeduped = useMemo(() => dedupeTechRecords(localRecords), [localRecords]);

  const staffId = sharedFeed?.staffId ?? localStaffId;
  const weekRange = sharedFeed?.weekRange ?? localWeekRange;
  const records = sharedFeed?.records ?? localRecordsDeduped;
  const loading = sharedFeed?.loading ?? (localLoading && localRecordsDeduped.length === 0);

  const staffReady = staffId === 'all' || (typeof staffId === 'number' && staffId > 0);

  const filteredRecords = useMemo(() => {
    if (!trimmedFilter) return records;
    return filterTechRecordRailRows(records, trimmedFilter);
  }, [records, trimmedFilter]);

  const queryKey = useMemo(
    () =>
      [
        'shipping-history-rail',
        staffId,
        weekRange.startStr,
        weekRange.endStr,
        trimmedFilter,
        filteredRecords.length,
      ] as const,
    [staffId, weekRange.startStr, weekRange.endStr, trimmedFilter, filteredRecords.length],
  );

  const fetchFn = useCallback(async (): Promise<TechRecord[]> => filteredRecords, [filteredRecords]);

  const eyebrowSuffix = staffId === 'all' ? 'All' : 'You';

  if (!staffReady && sessionStaffId <= 0) {
    return (
      <section className="min-w-0 border-t border-border-hairline bg-surface-card px-3 py-3">
        <p className="text-role-micro font-semibold text-text-faint">Sign in to see your history</p>
      </section>
    );
  }

  return (
    <SidebarRecentRailBase<TechRecord>
      queryKey={queryKey}
      fetchFn={fetchFn}
      refreshEvents={[...SHIPPING_RAIL_REFRESH_EVENTS]}
      selectedId={selectedOrderId}
      eyebrowTitle="History"
      eyebrowSuffix={eyebrowSuffix}
      emptyText={loading ? 'Loading history…' : 'No history this week'}
      getId={techRecordRailId}
      getActivityAt={getRowActivityAt}
      onSelect={(row) => {
        const order = techRecordToPreviewOrder(row);
        dispatchUpNextPreview(
          selectedOrderId === order.id ? null : { kind: 'order', order },
        );
      }}
      getStatusDot={getTechRecordStatusDot}
      getStatusDotLabel={getTechRecordStatusDotLabel}
      renderRowMain={(row, ctx) => <HistoryRowMain row={row} ctx={ctx} />}
    />
  );
}
