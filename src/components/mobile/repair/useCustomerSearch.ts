'use client';

import { useEffect, useState } from 'react';
import type { PickedCustomer } from '@/lib/repair/repair-info-edit';

/** The route refuses shorter queries (a 1-char pattern is a full scan). */
export const CUSTOMER_SEARCH_MIN_CHARS = 2;

/**
 * Debounced (250ms) `GET /api/customers/search` for the change-customer
 * picker — name, email or phone (last-ten-digit match). Runs only while
 * `enabled` and the query is long enough; aborts the in-flight request on
 * every keystroke and on unmount.
 */
export function useCustomerSearch(enabled: boolean, query: string) {
  const [results, setResults] = useState<PickedCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();
  const active = enabled && q.length >= CUSTOMER_SEARCH_MIN_CHARS;

  useEffect(() => {
    if (!active) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}&limit=20`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        const rows: PickedCustomer[] = Array.isArray(body?.customers)
          ? body.customers.map((c: PickedCustomer) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }))
          : [];
        setResults(rows);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [active, q]);

  return { results, loading, error, active };
}
