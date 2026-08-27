'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { dashboardShippedQuery } from '@/lib/queries/dashboard-queries';
import { resolveShippedQueryArgs } from '@/lib/shipped-dashboard-params';
import { dedupeShippedRecords, deriveShippedRecord } from '@/lib/shipped-records';
import type { OutboundState } from '@/lib/outbound-state';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import { ZERO_OUTBOUND_METRICS, type OutboundMetrics } from '@/lib/dashboard/outbound-metrics';

export { ZERO_OUTBOUND_METRICS, type OutboundMetrics };

export type OutboundCounts = Record<OutboundState, number>;

const ZERO_COUNTS: OutboundCounts = {
  PACKED_STAGED: 0,
  SCANNED_OUT: 0,
  IN_CUSTODY: 0,
  DELIVERED: 0,
  EXCEPTION: 0,
  PROCESS_GAP: 0,
  ORPHAN: 0,
};

const HOUR_MS = 3_600_000;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Week-summary counts for the scan-out sidebar tiles. Resolves params the same
 * way the main table does (so it shares one fetch via the React Query key) and
 * derives the outbound-state buckets from the deduped week records.
 */
export function useShippedScanOutData() {
  const searchParams = useSearchParams();
  const args = useMemo(() => resolveShippedQueryArgs(searchParams), [searchParams]);

  const query = useQuery({
    ...dashboardShippedQuery({
      weekStart: args.effectiveWeekStart,
      weekEnd: args.effectiveWeekEnd,
      packedBy: args.packedBy,
      testedBy: args.testedBy,
      shippedFilter: args.shippedFilter,
    }),
    placeholderData: (previousData) => previousData,
  });

  const counts = useMemo<OutboundCounts>(() => {
    const rows = (query.data ?? []) as PackerRecord[];
    if (rows.length === 0) return ZERO_COUNTS;
    const c: OutboundCounts = { ...ZERO_COUNTS };
    for (const r of dedupeShippedRecords(rows)) {
      c[deriveShippedRecord(r).outboundState] += 1;
    }
    return c;
  }, [query.data]);

  const total = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts],
  );

  const metrics = useMemo<OutboundMetrics>(() => {
    const rows = (query.data ?? []) as PackerRecord[];
    if (rows.length === 0) return ZERO_OUTBOUND_METRICS;
    const now = Date.now();
    const m: OutboundMetrics = { ...ZERO_OUTBOUND_METRICS };
    const dwellSamples: number[] = [];
    const stagedAges: number[] = [];

    for (const raw of dedupeShippedRecords(rows)) {
      const r = deriveShippedRecord(raw);
      m.shipped += 1;
      if (r.hasLeft) m.leftCount += 1;
      if (r.outboundState === 'DELIVERED') m.delivered += 1;
      if (r.outboundState === 'IN_CUSTODY') m.inTransit += 1;
      if (r.outboundState === 'SCANNED_OUT') m.scannedOut += 1;
      if (r.outboundState === 'PACKED_STAGED') m.staged += 1;
      if (r.outboundState === 'EXCEPTION' || r.outboundState === 'PROCESS_GAP') m.exceptions += 1;
      if (r.outboundState === 'ORPHAN') m.orphans += 1;

      // On-time ship rate — only over rows that carry a deadline.
      const deadline = raw.deadline_at ? Date.parse(raw.deadline_at) : NaN;
      const shipAt = r.effShipTime ? Date.parse(r.effShipTime) : NaN;
      if (!Number.isNaN(deadline)) {
        m.onTimeCoverage += 1;
        if (!Number.isNaN(shipAt) && shipAt <= deadline) m.onTime += 1;
      }

      // Staging dwell — pack → dock, only where the SHIP_CONFIRM scan happened.
      const packedAt = raw.created_at ? Date.parse(raw.created_at) : NaN;
      const confirmedAt = raw.ship_confirmed_at ? Date.parse(raw.ship_confirmed_at) : NaN;
      if (!Number.isNaN(packedAt) && !Number.isNaN(confirmedAt) && confirmedAt >= packedAt) {
        dwellSamples.push((confirmedAt - packedAt) / HOUR_MS);
      }

      // Backlog aging — how long staged packages have waited for scan-out.
      if (r.outboundState === 'PACKED_STAGED' && !Number.isNaN(packedAt) && now >= packedAt) {
        stagedAges.push((now - packedAt) / HOUR_MS);
      }
    }

    m.dwellCoverage = dwellSamples.length;
    m.dwellMedianHours = median(dwellSamples);
    m.stagedAvgAgeHours = stagedAges.length
      ? stagedAges.reduce((s, h) => s + h, 0) / stagedAges.length
      : null;
    return m;
  }, [query.data]);

  return {
    counts,
    total,
    metrics,
    isFetching: query.isFetching,
    // `isPending` is true only on a genuinely cold load (no data, no placeholder);
    // when this shares the warm table cache it's already false. `isError`/`refetch`
    // drive the strip's typed error state + retry.
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
