/** ONE builder for a receiving sidebar-rail's TanStack cache key. */
export function receivingRailQueryKey(
  segment: string,
  scope: string | undefined,
  query: string,
  staffId: number | null,
): readonly [string, string, string, string, string, string | number] {
  return [
    'receiving-lines-table',
    'rail',
    segment,
    scope ?? 'default',
    query,
    staffId ?? 'all',
  ] as const;
}
