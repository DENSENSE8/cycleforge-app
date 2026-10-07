'use client';

/** Packing-mode sidebar rail — the signed-in packer's recently packed orders for the current week. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { usePackerLogs, type PackerRecord } from '@/hooks/usePackerLogs';
import { computeWeekRange } from '@/utils/date';
import {
  dispatchPackActiveOrder,
  type PackActiveOrderPane,
} from '@/components/packer/usePackerOrderPane';
import {
  packerRecordRailId,
  packerRecordToPackPane,
} from '@/components/station/packer-record-mappers';
import {
  collapsePackerRailRows,
  getPackerRecordStatusDot,
  getPackerRecordStatusDotLabel,
  packerRecordToRailVM,
} from './pack-record-rail-vm';
import { emitPackerFocusScan } from '@/lib/print/pack-print-bundle-client';

interface Props {
  /** Signed-in packer's staff id. */
  packerId: number;
}

const PACK_HISTORY_LIMIT = 25;

// Module-scope so the shell's listener effect subscribes once instead of
// tearing down on every parent re-render (the `RecentActivityRailBase` rule).
const getRowActivityAt = (row: PackerRecord) => row.created_at;

/** The rail's selection mirrors the right pane's active order — it does not own it. */
function useActivePackPane(): PackActiveOrderPane | null {
  const [pane, setPane] = useState<PackActiveOrderPane | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      setPane((e as CustomEvent<PackActiveOrderPane | null>).detail || null);
    };
    window.addEventListener('pack-active-order-changed', handler);
    return () => window.removeEventListener('pack-active-order-changed', handler);
  }, []);
  return pane;
}

function PackRowMain({ row }: { row: PackerRecord }) {
  return <RailRowBody className="flex-1" vm={packerRecordToRailVM(row)} />;
}

export function PackRecentPacksRail({ packerId }: Props) {
  const activePane = useActivePackPane();

  // Same week range the `/pack` server prefetch and the History table use, so
  // all three share one `packer-logs` query instead of firing a second fetch.
  const weekRange = useMemo(() => {
    const { startStr, endStr } = computeWeekRange(0);
    return { startStr, endStr };
  }, []);

  const { data: records = [] } = usePackerLogs(packerId, { weekRange });

  // One row per package — a re-scan moves the package to the top.
  const railRecords = useMemo(() => collapsePackerRailRows(records), [records]);

  const recordsVersion = useMemo(
    () => railRecords.map((row) => packerRecordRailId(row)).join('|'),
    [railRecords],
  );

  const queryKey = useMemo(
    () => ['pack-recent-packs-rail', packerId, recordsVersion] as const,
    [packerId, recordsVersion],
  );

  const fetchFn = useCallback(async (): Promise<PackerRecord[]> => railRecords, [railRecords]);

  // Row ids are station-activity ids (unique); the pane carries a `packerLogId`
  // (and always a tracking/order identity). Resolve selection by FINDING the
  // matching row so a scan-driven open highlights its own rail row.
  const selectedId = useMemo(() => {
    if (!activePane) return null;
    const logId = activePane.packerLogId ?? 0;
    const tracking = activePane.tracking.trim().toUpperCase();
    const hit = railRecords.find((row) => {
      if (logId > 0 && Number(row.packer_log_id ?? 0) === logId) return true;
      if (!tracking) return false;
      return String(row.shipping_tracking_number || '').trim().toUpperCase() === tracking;
    });
    return hit ? packerRecordRailId(hit) : null;
  }, [activePane, railRecords]);

  const handleSelect = useCallback(
    (row: PackerRecord) => {
      // Re-selecting the open row closes the overlay — the workbench crossfades
      // back to the table (act-and-clear, matching the rail toggle elsewhere).
      const isOpen = selectedId != null && packerRecordRailId(row) === selectedId;
      dispatchPackActiveOrder(isOpen ? null : packerRecordToPackPane(row));
      // The rail row receives pointer focus before its click opens the packing
      // checklist. Hand it back after that pane paints so the next wedge scan
      // still lands in the station intake without an extra operator click.
      emitPackerFocusScan();
    },
    [selectedId],
  );

  if (packerId <= 0) {
    return (
      <section className="min-w-0 border-t border-border-hairline bg-surface-card px-3 py-3">
        <p className="text-role-micro font-semibold text-text-faint">Sign in to see your packs</p>
      </section>
    );
  }

  return (
    <SidebarRecentRailBase<PackerRecord>
      queryKey={queryKey}
      fetchFn={fetchFn}
      selectedId={selectedId}
      limit={PACK_HISTORY_LIMIT}
      eyebrowTitle="Recent packs"
      emptyText="No packs yet this week"
      getId={packerRecordRailId}
      getActivityAt={getRowActivityAt}
      onSelect={handleSelect}
      getStatusDot={getPackerRecordStatusDot}
      getStatusDotLabel={getPackerRecordStatusDotLabel}
      getCollapsePinLabel={(row) =>
        packerRecordToRailVM(row).titleAttr ?? 'Unknown Product'
      }
      getCollapsePinMeta={(row) => {
        const trk = String(row.shipping_tracking_number || '').trim();
        if (trk) return trk;
        const orderId = String(row.order_id || '').trim();
        return orderId || null;
      }}
      getCollapsePinFacts={(row) => [
        {
          tone: 'order',
          value: String(row.order_id || ''),
          platformValue: row.account_source,
        },
        {
          tone: 'tracking',
          value: String(row.shipping_tracking_number || ''),
          carrierHint: row.carrier ?? null,
        },
        { tone: 'sku', value: String(row.sku || '') },
      ]}
      renderRowMain={(row) => <PackRowMain row={row} />}
    />
  );
}
