/**
 * Recency buckets for the sidebar's chat list (Today / Yesterday / Previous 7
 * days / Previous 30 days / Older).
 *
 * Boundaries are LOCAL calendar midnights computed with `setDate`, never
 * `now - n * 24h`: across a DST change a day is 23 or 25 hours long, and a
 * fixed-millisecond window would drop a late-evening thread into the wrong
 * bucket. Input order is preserved inside each bucket; empty buckets are
 * omitted.
 */

export type SessionGroupKey = 'today' | 'yesterday' | 'week' | 'month' | 'older';

export interface SessionGroup<T> {
  key: SessionGroupKey;
  label: string;
  rows: T[];
}

const GROUPS: ReadonlyArray<{ key: SessionGroupKey; label: string; daysBack: number }> = [
  { key: 'today', label: 'Today', daysBack: 0 },
  { key: 'yesterday', label: 'Yesterday', daysBack: 1 },
  { key: 'week', label: 'Previous 7 days', daysBack: 7 },
  { key: 'month', label: 'Previous 30 days', daysBack: 30 },
];

export function groupSessionsByRecency<T extends { updatedAt: string }>(
  rows: readonly T[],
  now: Date,
): SessionGroup<T>[] {
  const starts = GROUPS.map(({ daysBack }) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
    return d.getTime();
  });
  const buckets: SessionGroup<T>[] = [
    ...GROUPS.map(({ key, label }) => ({ key, label, rows: [] as T[] })),
    { key: 'older', label: 'Older', rows: [] },
  ];
  for (const row of rows) {
    const at = Date.parse(row.updatedAt);
    // A future timestamp (clock skew) or an unparseable one reads as "Today"
    // and "Older" respectively: never dropped.
    const index = Number.isNaN(at) ? buckets.length - 1 : starts.findIndex((start) => at >= start);
    buckets[index === -1 ? buckets.length - 1 : index]!.rows.push(row);
  }
  return buckets.filter((b) => b.rows.length > 0);
}
