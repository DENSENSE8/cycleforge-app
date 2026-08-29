'use client';

/**
 * Org-shared column formatting, client side.
 *
 * One query per sheet (`['column-formats', tableId]`), optimistically patched on
 * write so pressing **B** paints immediately rather than after a round trip —
 * an operator formatting a column will press three or four marks in a row, and a
 * control that waits for the server between each reads as broken.
 *
 * The write is a full-format PUT rather than a patch of one field. The toolbar
 * always knows the column's complete format (it renders from it), the row is
 * tiny, and a field-level patch would need the server to merge — which is where
 * two operators formatting the same column at the same moment produce a row
 * neither of them asked for.
 */

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EMPTY_COLUMN_FORMAT,
  type ColumnFormat,
  type ColumnFormatMap,
} from '@/lib/tables/column-formats';

const EMPTY: ColumnFormatMap = {};

export function columnFormatsQueryKey(tableId: string) {
  return ['column-formats', tableId] as const;
}

export interface UseColumnFormatsResult {
  formats: ColumnFormatMap;
  setFormat: (columnKey: string, format: ColumnFormat) => void;
  clearAll: () => void;
  isLoading: boolean;
}

export function useColumnFormats(tableId: string | null): UseColumnFormatsResult {
  const queryClient = useQueryClient();
  const key = columnFormatsQueryKey(tableId ?? '');

  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: Boolean(tableId),
    // Formatting changes a handful of times a year, not a minute. A long stale
    // time keeps a sheet mount from firing this on every navigation.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ColumnFormatMap> => {
      const res = await fetch(`/api/tables/${tableId}/column-formats`);
      if (!res.ok) return EMPTY;
      const json = (await res.json()) as { formats?: ColumnFormatMap };
      return json.formats ?? EMPTY;
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: { columnKey: string; format: ColumnFormat }) => {
      const res = await fetch(`/api/tables/${tableId}/column-formats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnKey: input.columnKey, ...input.format }),
      });
      if (!res.ok) throw new Error('Failed to save column format');
      return res.json();
    },
    onMutate: async ({ columnKey, format }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ColumnFormatMap>(key) ?? EMPTY;
      queryClient.setQueryData<ColumnFormatMap>(key, {
        ...previous,
        [columnKey]: format,
      });
      return { previous };
    },
    onError: (_err, _input, context) => {
      // Put the old formatting back rather than leaving the operator looking at
      // a colour the org will not see.
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tables/${tableId}/column-formats`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear column formats');
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ColumnFormatMap>(key) ?? EMPTY;
      queryClient.setQueryData<ColumnFormatMap>(key, EMPTY);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const setFormat = useCallback(
    (columnKey: string, format: ColumnFormat) => {
      if (!tableId) return;
      mutation.mutate({ columnKey, format });
    },
    [mutation, tableId],
  );

  const clearAll = useCallback(() => {
    if (!tableId) return;
    clearMutation.mutate();
  }, [clearMutation, tableId]);

  return useMemo(
    () => ({ formats: data ?? EMPTY, setFormat, clearAll, isLoading }),
    [data, setFormat, clearAll, isLoading],
  );
}

/** One column's format, defaulted — so callers never branch on `undefined`. */
export function formatFor(
  formats: ColumnFormatMap,
  columnKey: string | null,
): ColumnFormat {
  if (!columnKey) return EMPTY_COLUMN_FORMAT;
  return formats[columnKey] ?? EMPTY_COLUMN_FORMAT;
}
