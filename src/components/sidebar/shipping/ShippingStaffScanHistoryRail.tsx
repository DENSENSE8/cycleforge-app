'use client';

/**
 * Shipping-mode sidebar rail — the signed-in staffer's 25 most recent TECH
 * station scans, regardless of week. It uses the same TechRecord anatomy as
 * the History tab; selecting a row opens Shipping preview for serial edits.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import type { SidebarRailRowContext } from '@/components/sidebar/SidebarRailShell';
import { dispatchUpNextPreview, type UpNextPreviewPayload } from '@/utils/events';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import { useTechLogs, type TechRecord } from '@/hooks/useTechLogs';
import { dedupeTechRecords, getTechRecordRowKey } from '@/lib/station/dedupe-tech-records';
import {
  filterTechRecordRailRows,
  getTechRecordStatusDot,
  getTechRecordStatusDotLabel,
  techRecordToRailVM,
} from '@/components/station/tech-record-rail-vm';
import {
  SHIPPING_RAIL_REFRESH_EVENTS,
  SHIPPING_RAIL_REFRESH_DOMAINS,
  techRecordRailId,
  techRecordToPreviewOrder,
} from './shipping-rail-shared';

interface Props {
  /** Signed-in TECH station operator. */
  techId: string;
  /** Client-side filter over the loaded history rows. */
  filterText?: string;
}

const SHIPPING_HISTORY_LIMIT = 25;
// History merges repeat scans for the same tracking key. Fetch a bounded 4×
// candidate window so the rail can still fill 25 distinct display rows.
const SHIPPING_HISTORY_FETCH_LIMIT = SHIPPING_HISTORY_LIMIT * 4;
const getRowActivityAt = (row: TechRecord) => row.created_at;

function useScanHistorySelection(): number | null {
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

export function ShippingStaffScanHistoryRail({ techId, filterText = '' }: Props) {
  const trimmedFilter = filterText.trim();
  const selectedOrderId = useScanHistorySelection();

  const parsedTechId = Number(techId);
  const sessionStaffId = Number.isFinite(parsedTechId) && parsedTechId > 0 ? parsedTechId : 0;
  const { data: rawRecords = [], isLoading } = useTechLogs(sessionStaffId, {
    limit: SHIPPING_HISTORY_FETCH_LIMIT,
  });
  const records = useMemo(
    () => dedupeTechRecords(rawRecords).slice(0, SHIPPING_HISTORY_LIMIT),
    [rawRecords],
  );
  const filteredRecords = useMemo(
    () => filterTechRecordRailRows(records, trimmedFilter),
    [records, trimmedFilter],
  );
  const recordsVersion = useMemo(
    () => records.map((row) => `${getTechRecordRowKey(row)}:${row.updated_at ?? row.created_at}`).join('|'),
    [records],
  );

  const queryKey = useMemo(
    () => ['shipping-scan-history-rail', sessionStaffId, trimmedFilter, recordsVersion] as const,
    [sessionStaffId, trimmedFilter, recordsVersion],
  );

  const fetchFn = useCallback(async (): Promise<TechRecord[]> => filteredRecords, [filteredRecords]);

  if (sessionStaffId <= 0) {
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
      refreshDomains={SHIPPING_RAIL_REFRESH_DOMAINS}
      selectedId={selectedOrderId}
      limit={SHIPPING_HISTORY_LIMIT}
      eyebrowTitle="History"
      eyebrowSuffix="You"
      emptyText={isLoading ? 'Loading history…' : 'No recent station scans'}
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
