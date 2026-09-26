'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WorkOrderRow } from '@/components/work-orders/types';
import { useRefreshSignal } from '@/lib/refresh/bus';

/** Loads work-order assignments whose deadline falls within [from, to) from the windowed calendar endpoint (GET /api/work-orders/calendar). */
export function useCalendarWorkOrders(from: Date, to: Date) {
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: fromISO, to: toISO });
      const res = await fetch(`/api/work-orders/calendar?${params.toString()}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(String(payload?.details || payload?.error || 'Failed to load calendar'));
      }
      const data = await res.json();
      setRows(Array.isArray(data?.rows) ? (data.rows as WorkOrderRow[]) : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load calendar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromISO, toISO]);

  useEffect(() => {
    void load();
  }, [load]);

  // A successful assign signals `work-orders` (saveWorkOrder does) — keep the
  // calendar in sync with the queue without a manual refresh.
  useRefreshSignal('work-orders', () => void load());

  return { rows, loading, error, refetch: load };
}
