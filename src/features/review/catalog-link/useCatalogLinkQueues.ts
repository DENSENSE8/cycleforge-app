'use client';

/** Reads for Review · Listing match and Review · Missing item number. */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';

export const CATALOG_LINK_QUERY_KEY = ['review-catalog-link'] as const;
export const IMPORT_EXCEPTION_QUERY_KEY = ['review-import-exceptions'] as const;

async function fetchQueue<T>(url: string): Promise<{ items: T[]; total: number }> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    items?: T[];
    total?: number;
    error?: string;
  };
  if (!res.ok || !body.success) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return { items: body.items ?? [], total: Number(body.total ?? 0) };
}

export function useCatalogLinkQueue(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: [...CATALOG_LINK_QUERY_KEY, q] as const,
    queryFn: () =>
      fetchQueue<CatalogLinkChoreRow>(
        `/api/review/catalog-link${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      ),
    staleTime: 15_000,
  });
}

export function useImportExceptionQueue(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: [...IMPORT_EXCEPTION_QUERY_KEY, q] as const,
    queryFn: () =>
      fetchQueue<ImportExceptionRow>(
        `/api/review/import-exceptions${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      ),
    staleTime: 15_000,
  });
}

export function useCatalogLinkQueueActions() {
  const queryClient = useQueryClient();
  const invalidateChores = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CATALOG_LINK_QUERY_KEY });
  }, [queryClient]);
  const invalidateExceptions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: IMPORT_EXCEPTION_QUERY_KEY });
  }, [queryClient]);
  return { invalidateChores, invalidateExceptions };
}
