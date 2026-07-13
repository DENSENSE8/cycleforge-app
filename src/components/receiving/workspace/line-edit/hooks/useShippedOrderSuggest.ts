'use client';

import { useEffect, useRef, useState } from 'react';
import type { ShippedOrderSuggestion } from '@/lib/receiving/returned-serial-link';

/**
 * Typeahead layer behind the "Order #" search in {@link UnfoundMatchStrip}.
 *
 * Debounced (latest-wins, abortable) `GET /api/receiving/shipped-order-lookup?q=`
 * returning candidate shipped orders whose order number contains what the
 * operator is typing. Read-only — the caller links the picked order via
 * import-sales-order. Mirrors {@link useShippedOrderCompare} in shape so the
 * Order # lane stays consistent.
 */
export function useShippedOrderSuggest(rawQuery: string, enabled = true) {
  const [candidates, setCandidates] = useState<ShippedOrderSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = rawQuery.trim();
    abortRef.current?.abort();
    if (!enabled || q.length < 2) {
      abortRef.current = null;
      setCandidates([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/receiving/shipped-order-lookup?q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const data = (await res.json().catch(() => null)) as
          | { success?: boolean; candidates?: ShippedOrderSuggestion[] }
          | null;
        if (controller.signal.aborted) return;
        setCandidates(res.ok && data?.success ? data.candidates ?? [] : []);
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') setCandidates([]);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rawQuery, enabled]);

  // Abort any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { candidates, loading };
}
