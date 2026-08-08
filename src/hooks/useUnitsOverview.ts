'use client';

/**
 * Inventory › Units overview — feed for `/inventory/units` browse grid.
 * Row shape is the SoT for descriptors / NonlinearTableHost binding.
 */

import { useEffect, useState } from 'react';

export type UnitsOverviewRow = {
  id: number;
  serial_number: string | null;
  product_title: string | null;
  sku: string | null;
  current_status: string | null;
  condition_grade: string | null;
  current_location: string | null;
  updated_at: string | null;
};

type UseUnitsOverviewArgs = {
  q?: string;
  states?: string[];
  conditions?: string[];
};

type UseUnitsOverviewResult = {
  rows: UnitsOverviewRow[];
  loading: boolean;
};

export function useUnitsOverview({
  q = '',
  states = [],
  conditions = [],
}: UseUnitsOverviewArgs = {}): UseUnitsOverviewResult {
  const [rows, setRows] = useState<UnitsOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    for (const state of states) params.append('state', state);
    for (const condition of conditions) params.append('condition', condition);
    params.set('limit', '200');

    let cancelled = false;
    setLoading(true);
    void fetch(`/api/inventory/units?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`units overview ${res.status}`);
        return (await res.json()) as { items?: UnitsOverviewRow[] };
      })
      .then((body) => {
        if (!cancelled) setRows(Array.isArray(body.items) ? body.items : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [q, states, conditions]);

  return { rows, loading };
}
