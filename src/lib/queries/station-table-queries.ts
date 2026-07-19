/**
 * Station TABLE query factories (station-table-unification-plan §7.1) — the SoT
 * for the station COUNTS queries (the sidebar legend + lane bubble headers call
 * these, not ad-hoc `fetch` keys). Query keys align with the `invalidate*Counts`
 * helpers in `station-cache-patch.ts` (`['tech-logs-counts']` /
 * `['packer-logs-counts']`) so a live scan refreshes the tally without a full
 * list refetch. The list queries themselves stay in `useTechLogs`/`usePackerLogs`.
 *
 * (Named `station-table-*` because `station-queries.ts` is already the
 * station-BUILDER definition factory — a different concern.)
 */

/** Uniform counts response (§7.2). `byLane` is re-derived client-side (Decision 12). */
interface StationCounts {
  total: number;
  byDay: Record<string, number>;
  truncated: boolean;
}

const EMPTY_COUNTS: StationCounts = { total: 0, byDay: {}, truncated: false };

export function packerCountsQuery({
  weekStart = '',
  weekEnd = '',
  packedBy = null,
  staff = null,
}: {
  weekStart?: string;
  weekEnd?: string;
  packedBy?: number | null;
  staff?: number | null;
}) {
  const params = new URLSearchParams();
  if (weekStart) params.set('weekStart', weekStart);
  if (weekEnd) params.set('weekEnd', weekEnd);
  if (packedBy != null && packedBy > 0) params.set('packedBy', String(packedBy));
  if (staff != null && staff > 0) params.set('staff', String(staff));
  return {
    queryKey: ['packer-logs-counts', { weekStart, weekEnd, packedBy, staff }] as const,
    queryFn: async (): Promise<StationCounts> => {
      const res = await fetch(`/api/packerlogs/counts?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return EMPTY_COUNTS;
      return (await res.json()) as StationCounts;
    },
    staleTime: 30_000,
  };
}

