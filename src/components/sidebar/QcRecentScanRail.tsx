'use client';

import { useCallback, useMemo } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import {
  getDeskPickRecordStatusDot,
  getDeskPickRecordStatusDotLabel,
  techRecordRailTitle,
  techRecordToRailVM,
} from '@/components/station/tech-record-rail-vm';
import { useDeskPickLogs, type DeskPickRecord } from '@/hooks/useDeskPickLogs';
import { useAuth } from '@/contexts/AuthContext';

const QC_RECENT_LIMIT = 12;

export function QcRecentScanRail() {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const { data: records = [], isLoading } = useDeskPickLogs(staffId, {
    limit: QC_RECENT_LIMIT,
    enabled: staffId > 0,
  });
  const rows = useMemo(() => records.slice(0, QC_RECENT_LIMIT), [records]);
  const queryKey = useMemo(
    () => ['qc-recent-scans', staffId, rows.map((row) => `${row.id}:${row.created_at}`).join('|')] as const,
    [staffId, rows],
  );
  const fetchFn = useCallback(async (): Promise<DeskPickRecord[]> => rows, [rows]);

  return (
    <div className="flex h-2/5 min-h-48 flex-col border-b border-border-hairline">
      <SidebarRailScrollport>
        <SidebarRecentRailBase<DeskPickRecord>
          queryKey={queryKey}
          fetchFn={fetchFn}
          selectedId={null}
          limit={QC_RECENT_LIMIT}
          eyebrowTitle="Recent QC scans"
          emptyText={isLoading ? 'Loading recent QC scans…' : 'No recent QC scans'}
          getId={(row) => row.id}
          getActivityAt={(row) => row.created_at}
          // This is an informational last-scan strip; there is no safe QC detail
          // route from a desk-pick row, so do not expose a dead selection affordance.
          getRowDisabled={() => true}
          onSelect={() => undefined}
          getStatusDot={getDeskPickRecordStatusDot}
          getStatusDotLabel={getDeskPickRecordStatusDotLabel}
          getCollapsePinLabel={techRecordRailTitle}
          getCollapsePinMeta={(row) => row.serial_number || row.sku || null}
          renderRowMain={(row) => <RailRowBody className="flex-1" vm={techRecordToRailVM(row)} />}
        />
      </SidebarRailScrollport>
    </div>
  );
}
