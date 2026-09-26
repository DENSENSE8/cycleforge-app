'use client';

import { useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fnskuHubPath } from '@/lib/mobile/fnsku-hub-href';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';

/** One `fba_fnskus` catalog row — `GET /api/admin/fba-fnskus/[fnsku]`. */
export interface FnskuRecord {
  fnsku: string;
  product_title: string | null;
  asin: string | null;
  sku: string | null;
  condition: string | null;
  is_active: boolean | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** The catalog row, or null when this org has no such FNSKU (404). */
export async function fetchFnskuRecord(fnsku: string): Promise<FnskuRecord | null> {
  const res = await fetch(`/api/admin/fba-fnskus/${encodeURIComponent(fnsku)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load ${fnsku} (${res.status})`);
  return ((await res.json()) as { fnsku: FnskuRecord }).fnsku;
}

/**
 * The FNSKU record the hub and `/info` share: the scanned key from the route,
 * the job it was opened from (`?back=`, for the bar's X), and one React Query
 * read of the org's catalog row.
 */
export function useFnskuRecord() {
  const params = useParams<{ fnsku: string }>();
  const searchParams = useSearchParams();
  const fnsku = decodeURIComponent(params?.fnsku ?? '').trim().toUpperCase();
  const back = mobileJobReturn(searchParams.get('back'));
  const base = fnskuHubPath(fnsku);
  /** A sibling screen of this record, keeping the job the X returns to. */
  const link = useCallback((href: string) => (back ? withJobReturn(href, back) : href), [back]);

  const query = useQuery({
    queryKey: ['mobile-fnsku-record', fnsku],
    queryFn: () => fetchFnskuRecord(fnsku),
    enabled: fnsku.length > 0,
  });

  return {
    fnsku,
    back,
    base,
    link,
    record: query.data,
    state: {
      loading: fnsku.length > 0 && query.isPending,
      error: fnsku.length === 0 ? 'No FNSKU in this link.' : (query.error?.message ?? null),
      onRetry: () => void query.refetch(),
      missing: `${fnsku} is not in the FBA catalog.`,
    },
  };
}
