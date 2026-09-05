/**
 * Unshipped list cache identity — one shape for the table, the RSC seed, and
 * the BootGate warm. Hand-rolling the key in the seed dropped `blockedOnly`
 * and served To-ship rows to the Pending desk (and missed the table's key on
 * both desks).
 */

export type UnshippedOrdersQueryArgs = {
  searchQuery?: string;
  packedBy?: number;
  testedBy?: number;
  staffId?: number;
  strictSearchScope?: boolean;
  stage?: 'pending' | 'tested' | 'packed';
  limit?: number;
  /** Pending desk — out-of-stock live work, label or no label. */
  blockedOnly?: boolean;
};

export function unshippedOrdersQueryKey({
  searchQuery = '',
  packedBy,
  testedBy,
  staffId,
  strictSearchScope = false,
  stage,
  limit,
  blockedOnly = false,
}: UnshippedOrdersQueryArgs = {}) {
  return [
    'dashboard-table',
    'unshipped',
    {
      searchQuery,
      packedBy,
      testedBy,
      staffId,
      strictSearchScope,
      stage: stage ?? null,
      limit: limit ?? null,
      blockedOnly,
    },
  ] as const;
}
