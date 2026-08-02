'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  TrackingExceptionRow,
  TrackingExceptionStatusFilter,
} from './types';

/**
 * Data + mutations for the Tracking Exceptions ops queue.
 *
 * The grid is a display map only — fetch / refresh / PATCH / DELETE live here
 * so {@link TrackingExceptionsGridView} stays free of side effects.
 */
export function useTrackingExceptions(status: TrackingExceptionStatusFilter, search: string) {
  const [rows, setRows] = useState<TrackingExceptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set());

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('domain', 'receiving');
      params.set('status', status);
      params.set('limit', '200');
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/tracking-exceptions?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Failed to load');
      setRows((data.rows || []) as TrackingExceptionRow[]);
      setTotal(typeof data.total === 'number' ? data.total : (data.rows?.length || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const refreshRow = useCallback(
    async (row: TrackingExceptionRow) => {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.add(row.id);
        return next;
      });
      try {
        const res = await fetch(`/api/tracking-exceptions/${row.id}/refresh`, {
          method: 'POST',
        });
        const data = await res.json();
        if (!data?.success) {
          throw new Error(data?.error || 'Refresh failed');
        }
        await fetchRows();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Refresh failed');
      } finally {
        setRefreshingIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [fetchRows],
  );

  const saveRow = useCallback(
    async (row: TrackingExceptionRow, patch: Partial<TrackingExceptionRow>) => {
      const res = await fetch(`/api/tracking-exceptions/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Save failed');
      await fetchRows();
    },
    [fetchRows],
  );

  const deleteRow = useCallback(
    async (row: TrackingExceptionRow) => {
      const res = await fetch(`/api/tracking-exceptions/${row.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Delete failed');
      await fetchRows();
    },
    [fetchRows],
  );

  return {
    rows,
    total,
    loading,
    error,
    refreshingIds,
    fetchRows,
    refreshRow,
    saveRow,
    deleteRow,
  };
}
