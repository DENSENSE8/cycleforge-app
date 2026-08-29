'use client';

/**
 * The org's sheet catalog, client side.
 *
 * One query for the whole app (`['org-table-catalog']`) — the catalog is a
 * property of the organization, not of a page, and every sheet's bottom strip
 * reads the same answer. A per-surface key would fire this once per table an
 * operator visits for a value that cannot differ between them.
 *
 * Writes replace the catalog wholesale (see `replaceOrgTables` for why) and
 * patch optimistically, so toggling a table in the picker is immediate — an
 * operator curating a strip toggles several in a row, and a control that waits
 * for a round trip between each reads as broken.
 */

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResolvedCatalogEntry } from '@/lib/tables/org-tables';

export const ORG_TABLE_CATALOG_QUERY_KEY = ['org-table-catalog'] as const;

const EMPTY: ResolvedCatalogEntry[] = [];

export interface UseOrgTableCatalogResult {
  /** Every table the product offers, with this org's decision applied. */
  catalog: ResolvedCatalogEntry[];
  /** Just the strip: enabled, in order. */
  enabled: ResolvedCatalogEntry[];
  setEnabled: (tableId: string, enabled: boolean) => void;
  isLoading: boolean;
}

export function useOrgTableCatalog(): UseOrgTableCatalogResult {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ORG_TABLE_CATALOG_QUERY_KEY,
    // A catalog changes when an admin curates it, which is rare. A long stale
    // time keeps this off the critical path of every sheet mount.
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ResolvedCatalogEntry[]> => {
      const res = await fetch('/api/tables/catalog');
      if (!res.ok) return EMPTY;
      const json = (await res.json()) as { tables?: ResolvedCatalogEntry[] };
      return json.tables ?? EMPTY;
    },
  });

  const mutation = useMutation({
    mutationFn: async (next: ResolvedCatalogEntry[]) => {
      const res = await fetch('/api/tables/catalog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: next.map((t) => ({
            tableId: t.tableId,
            enabled: t.enabled,
            sortOrder: t.sortOrder,
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to save the table catalog');
      return res.json();
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ORG_TABLE_CATALOG_QUERY_KEY });
      const previous = queryClient.getQueryData<ResolvedCatalogEntry[]>(
        ORG_TABLE_CATALOG_QUERY_KEY,
      );
      queryClient.setQueryData(ORG_TABLE_CATALOG_QUERY_KEY, next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      // Put the old strip back rather than leaving the operator looking at tabs
      // the rest of the org will not have.
      if (context?.previous) {
        queryClient.setQueryData(ORG_TABLE_CATALOG_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_TABLE_CATALOG_QUERY_KEY });
    },
  });

  const catalog = data ?? EMPTY;

  const setEnabled = useCallback(
    (tableId: string, enabled: boolean) => {
      // Every entry is written, not just the toggled one: the server replaces
      // wholesale, so sending a single row would delete the rest.
      mutation.mutate(
        catalog.map((entry) =>
          entry.tableId === tableId ? { ...entry, enabled, explicit: true } : entry,
        ),
      );
    },
    [catalog, mutation],
  );

  const enabled = useMemo(() => catalog.filter((e) => e.enabled), [catalog]);

  return { catalog, enabled, setEnabled, isLoading };
}
