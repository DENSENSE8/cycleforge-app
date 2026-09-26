import type { QueryClient } from '@tanstack/react-query';

/** Station-log cache surgery — the station twin of {@link import('./dashboard-cache-patch')} (station-table-unification-plan §7.3). */

const TECH_LIST_KEY = ['tech-logs'] as const;
const TECH_COUNTS_KEY = ['tech-logs-counts'] as const;
const PACKER_LIST_KEY = ['packer-logs'] as const;
const PACKER_COUNTS_KEY = ['packer-logs-counts'] as const;
const RECEIVING_LIST_KEY = ['receiving-lines'] as const;
const RECEIVING_COUNTS_KEY = ['receiving-lines-counts'] as const;

type StationRow = { id?: number | string } & Record<string, unknown>;

/** Merge a partial patch into a matching row across every cached list variant. */
function patchRowByPrefix(
  queryClient: QueryClient,
  prefix: readonly string[],
  rowId: number,
  patch: Partial<StationRow>,
): void {
  if (!Number.isFinite(rowId)) return;
  queryClient.setQueriesData({ queryKey: prefix }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    let changed = false;
    const next = current.map((row: StationRow) => {
      if (Number(row?.id) !== rowId) return row;
      changed = true;
      return { ...row, ...patch };
    });
    return changed ? next : current;
  });
}

/** Drop a row from every cached list variant. */
function removeRowByPrefix(queryClient: QueryClient, prefix: readonly string[], rowId: number): void {
  if (!Number.isFinite(rowId)) return;
  queryClient.setQueriesData({ queryKey: prefix }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    const next = current.filter((row: StationRow) => Number(row?.id) !== rowId);
    return next.length === current.length ? current : next;
  });
}

/** Prepend a freshly-scanned row to the caches whose week bounds contain it (or all mounted list caches when bounds are unknown — a single… */
function prependRowByPrefix(queryClient: QueryClient, prefix: readonly string[], record: StationRow): void {
  const id = Number(record?.id);
  if (!Number.isFinite(id)) return;
  queryClient.setQueriesData({ queryKey: prefix }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    if (current.some((row: StationRow) => Number(row?.id) === id)) return current;
    return [record, ...current];
  });
}

// ── Tech ─────────────────────────────────────────────────────────────────────
export function patchTechLogCache(queryClient: QueryClient, rowId: number, patch: Partial<StationRow>): void {
  patchRowByPrefix(queryClient, TECH_LIST_KEY, rowId, patch);
}
export function removeTechLogFromCache(queryClient: QueryClient, rowId: number): void {
  removeRowByPrefix(queryClient, TECH_LIST_KEY, rowId);
}
export function prependTechLogCache(queryClient: QueryClient, record: StationRow): void {
  prependRowByPrefix(queryClient, TECH_LIST_KEY, record);
}
export function invalidateTechCounts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: TECH_COUNTS_KEY });
}

// ── Packer ───────────────────────────────────────────────────────────────────
export function patchPackerLogCache(queryClient: QueryClient, rowId: number, patch: Partial<StationRow>): void {
  patchRowByPrefix(queryClient, PACKER_LIST_KEY, rowId, patch);
}
function removePackerLogFromCache(queryClient: QueryClient, rowId: number): void {
  removeRowByPrefix(queryClient, PACKER_LIST_KEY, rowId);
}
export function prependPackerLogCache(queryClient: QueryClient, record: StationRow): void {
  prependRowByPrefix(queryClient, PACKER_LIST_KEY, record);
}
export function invalidatePackerCounts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: PACKER_COUNTS_KEY });
}

// ── Receiving ──────────────────────────────────────────────────────────────
export function patchReceivingLineCache(queryClient: QueryClient, lineId: number, patch: Partial<StationRow>): void {
  patchRowByPrefix(queryClient, RECEIVING_LIST_KEY, lineId, patch);
}
export function removeReceivingLineFromCache(queryClient: QueryClient, lineId: number): void {
  removeRowByPrefix(queryClient, RECEIVING_LIST_KEY, lineId);
}
function invalidateReceivingCounts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: RECEIVING_COUNTS_KEY });
}

/** Broad list-prefix invalidate — reconnect only (NOT the hot path). */
export function invalidateAllStationLists(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: TECH_LIST_KEY });
  queryClient.invalidateQueries({ queryKey: PACKER_LIST_KEY });
  queryClient.invalidateQueries({ queryKey: RECEIVING_LIST_KEY });
}
