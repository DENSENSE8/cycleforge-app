'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { searchManuals } from './sku-testing-api';
import type { ManualRow } from './sku-testing-types';

/**
 * Debounced (250ms) manuals-library search + pair action for the manual
 * picker. Owns the query, results, and per-row pairing state.
 * Callers supply `onPair` (receiving-line or SKU-based).
 */
export function useManualPicker(
  onPair: (manualId: number) => Promise<void>,
  onPaired: () => Promise<void>,
) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ManualRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [pairingId, setPairingId] = useState<number | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          setResults(await searchManuals(q));
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const pair = useCallback(
    async (manualId: number) => {
      setPairingId(manualId);
      try {
        await onPair(manualId);
        toast.success('Manual paired');
        await onPaired();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not pair manual');
      } finally {
        setPairingId(null);
      }
    },
    [onPair, onPaired],
  );

  return { query, setQuery, results, searching, pairingId, pair };
}
