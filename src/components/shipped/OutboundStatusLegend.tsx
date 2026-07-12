'use client';

import { OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { useShippedScanOutData } from '@/hooks/useShippedScanOutData';
import { useOutboundStatusFilter } from '@/components/shipped/useOutboundStatusFilter';
import { StatusLegend, type StatusLegendItem } from '@/components/ui/StatusLegend';

/**
 * Outbound (post-dock) status legend — the Shipped-mode subset of the shared
 * {@link StatusLegend}. One wrapped chip strip (dot + short label + count) that
 * reads cleanly in BOTH the Shipped List and Scan-Out modes and explains the
 * colored status dots in the table on the right.
 *
 * Counts come from {@link useShippedScanOutData}, which shares the main table's
 * React Query fetch — mounting this adds no extra request. EXCEPTION folds in
 * PROCESS_GAP (same bucket the scan-out tiles used).
 */
const ITEMS: StatusLegendItem<OutboundState>[] = [
  { state: 'PACKED_STAGED', short: 'Staging' },
  { state: 'SCANNED_OUT', short: 'Out' },
  { state: 'IN_CUSTODY', short: 'Custody' },
  { state: 'DELIVERED', short: 'Delivered' },
  { state: 'ORPHAN', short: 'Orphan' },
  { state: 'EXCEPTION', short: 'Exception', fold: 'PROCESS_GAP' },
];

export function OutboundStatusLegend({ inline = false }: { inline?: boolean } = {}) {
  const { counts, total } = useShippedScanOutData();
  // Click-to-filter (`?ostatus`) — shared with the Outbound KPI strip's donut +
  // dials, so a filter set from any of the three surfaces lights the others.
  const { active, toggle, clear } = useOutboundStatusFilter();

  return (
    <StatusLegend
      items={ITEMS}
      meta={OUTBOUND_STATE_META}
      counts={counts}
      allCount={total}
      activeState={active}
      onSelectState={toggle}
      onSelectAll={clear}
      inline={inline}
    />
  );
}
