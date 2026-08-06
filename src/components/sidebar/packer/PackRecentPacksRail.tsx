'use client';

/**
 * Packing-mode sidebar rail — the signed-in packer's recently packed orders for
 * the current week. Selecting a row re-opens that pack in the right pane, which
 * crossfades the Queue/History table → `PackOrderPanel` (the Unbox rail →
 * workspace contract; see `.claude/rules/display/workbench.md`).
 *
 * Composes {@link SidebarRecentRailBase} — the shell owns fetch/skeleton/
 * selection/keyboard-nav/stagger; this wrapper supplies only the row renderers
 * and the domain wiring. Rows come from {@link usePackerLogs}, so the rail
 * shares the page's prefetched `packer-logs` cache with the History table and
 * inherits its live Ably inserts + `packer-log-added` surgical patch for free.
 */

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
  filterPackerRailRows,
  getPackerRecordStatusDot,
  getPackerRecordStatusDotLabel,
  packerRecordToRailVM,
} from './pack-record-rail-vm';
import {
  EMPTY_STATION_HISTORY_RAIL_FACETS,
  matchesStationHistoryRailFacets,
  type StationHistoryRailFacets,
} from '@/components/sidebar/rail-shell/StationHistoryRailFilters';

interface Props {
  /** Signed-in packer's staff id. */
  packerId: number;
  /** Client-side filter over the loaded history rows. */
  filterText?: string;
  /** Platform facet keep-filter (account_source). */
  facets?: StationHistoryRailFacets;
}

const PACK_HISTORY_LIMIT = 25;

// Module-scope so the shell's listener effect subscribes once instead of
// tearing down on every parent re-render (the `RecentActivityRailBase` rule).
const getRowActivityAt = (row: PackerRecord) => row.created_at;

/**
 * The rail's selection mirrors the right pane's active order — it does not own
 * it. Both a sidebar scan and a rail click flow through the same
 * `pack-active-order-changed` event, so the rail highlights whichever order the
 * workbench is showing, however it got there.
 */
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

export function PackRecentPacksRail({
  packerId,
  filterText = '',
  facets = EMPTY_STATION_HISTORY_RAIL_FACETS,
}: Props) {
  const trimmedFilter = filterText.trim();
  const activePane = useActivePackPane();

  // Same week range the `/pack` server prefetch and the History table use, so
  // all three share one `packer-logs` query instead of firing a second fetch.
  const weekRange = useMemo(() => {
    const { startStr, endStr } = computeWeekRange(0);
    return { startStr, endStr };
  }, []);

  const { data: records = [], isLoading } = usePackerLogs(packerId, { weekRange });

  const filteredRecords = useMemo(
    () =>
      filterPackerRailRows(records, trimmedFilter).filter((row) =>
        matchesStationHistoryRailFacets(row.account_source, facets),
      ),
    [records, trimmedFilter, facets],
  );

  const recordsVersion = useMemo(
    () => filteredRecords.map((row) => packerRecordRailId(row)).join('|'),
    [filteredRecords],
  );

  const queryKey = useMemo(
    () => ['pack-recent-packs-rail', packerId, trimmedFilter, recordsVersion] as const,
    [packerId, trimmedFilter, recordsVersion],
  );

  const fetchFn = useCallback(async (): Promise<PackerRecord[]> => filteredRecords, [filteredRecords]);

  // Row ids are station-activity ids (unique); the pane carries a `packerLogId`
  // (and always a tracking/order identity). Resolve selection by FINDING the
  // matching row so a scan-driven open highlights its own rail row.
  const selectedId = useMemo(() => {
    if (!activePane) return null;
    const logId = activePane.packerLogId ?? 0;
    const tracking = activePane.tracking.trim().toUpperCase();
    const hit = filteredRecords.find((row) => {
      if (logId > 0 && Number(row.packer_log_id ?? 0) === logId) return true;
      if (!tracking) return false;
      return String(row.shipping_tracking_number || '').trim().toUpperCase() === tracking;
    });
    return hit ? packerRecordRailId(hit) : null;
  }, [activePane, filteredRecords]);

  const handleSelect = useCallback(
    (row: PackerRecord) => {
      // Re-selecting the open row closes the overlay — the workbench crossfades
      // back to the table (act-and-clear, matching the rail toggle elsewhere).
      const isOpen = selectedId != null && packerRecordRailId(row) === selectedId;
      dispatchPackActiveOrder(isOpen ? null : packerRecordToPackPane(row));
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
      eyebrowSuffix="You"
      emptyText={isLoading ? 'Loading recent packs…' : 'No packs yet this week'}
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
        { tone: 'order', value: String(row.order_id || '') },
        { tone: 'tracking', value: String(row.shipping_tracking_number || '') },
        { tone: 'sku', value: String(row.sku || '') },
      ]}
      renderRowMain={(row) => <PackRowMain row={row} />}
    />
  );
}
