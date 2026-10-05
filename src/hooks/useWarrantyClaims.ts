'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { warrantyClaimsQuery, warrantyCoverageQuery } from '@/lib/queries/dashboard-queries';
import { fetchWarrantyClaim } from '@/lib/warranty/client';
import type { WarrantyClaimStatus } from '@/lib/warranty/types';

/** Look-ahead window (days) for the "30 days out" expiry filter (matches the 30-day term). */
const WARRANTY_EXPIRING_SOON_DAYS = 30;

interface UseWarrantyClaimsParams {
  status?: WarrantyClaimStatus | null;
  search?: string;
  expiringSoon?: boolean;
}

/** Claim list — shared cache key with the sidebar + right-pane table. */
export function useWarrantyClaims(params: UseWarrantyClaimsParams = {}) {
  const queryParams = useMemo(
    () => ({
      status: params.status ?? null,
      search: params.search ?? '',
      expiringWithinDays: params.expiringSoon ? WARRANTY_EXPIRING_SOON_DAYS : null,
    }),
    [params.status, params.search, params.expiringSoon],
  );
  return useQuery({
    ...warrantyClaimsQuery(queryParams),
    placeholderData: (prev) => prev,
  });
}

/** Minimum query length before the coverage lookup fires (avoids noise on 1–2 chars). */
const WARRANTY_COVERAGE_MIN_CHARS = 3;

/**
 * Read-only warranty-coverage lookup for the active search/scan value. Only runs
 * once the query is specific enough; shares the debounced search box with the list.
 */
export function useWarrantyCoverage(query: string) {
  const q = query.trim();
  const enabled = q.length >= WARRANTY_COVERAGE_MIN_CHARS;
  return useQuery({
    ...warrantyCoverageQuery(q),
    enabled,
    placeholderData: (prev) => prev,
  });
}

/** Single claim detail (right-pane detail panel). */
export function useWarrantyClaim(id: number | null) {
  return useQuery({
    queryKey: ['warranty-claim', id],
    queryFn: () => (id ? fetchWarrantyClaim(id) : Promise.resolve(null)),
    enabled: id != null,
    staleTime: 30_000,
  });
}
