'use client';

/**
 * The two import lists of a new sales order — shared by the desk and phone
 * faces. Square: the org's newest invoices, filtered locally. Ecwid: a
 * storefront order search (number, buyer, product words), debounced.
 */

import { useEffect, useMemo, useState } from 'react';
import type { EcwidOrderImport } from '@/lib/orders/ecwid-order-import';
import type { SquareInvoiceImport } from '@/lib/orders/square-invoice-import-core';

export interface SquareInvoiceList {
  /** `null` while loading. */
  connected: boolean | null;
  invoices: SquareInvoiceImport[];
  /** `invoices` narrowed by `query` (number, customer, title, line titles). */
  shown: SquareInvoiceImport[];
  error: string | null;
}

export function useSquareInvoiceImports(query: string): SquareInvoiceList {
  const [data, setData] = useState<{ connected: boolean; invoices: SquareInvoiceImport[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch('/api/orders/intake/square-invoices', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((body: { ok?: boolean; error?: string; connected?: boolean; invoices?: SquareInvoiceImport[] }) => {
        if (!live) return;
        if (!body.ok) setError(body.error || 'Square did not answer.');
        else setData({ connected: body.connected === true, invoices: body.invoices ?? [] });
      })
      .catch(() => live && setError('Square did not answer.'));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.invoices ?? [];
    return q
      ? all.filter((inv) =>
          [inv.invoiceNumber, inv.customer.name, inv.title ?? '', ...inv.lines.map((l) => l.title)].join(' ').toLowerCase().includes(q),
        )
      : all;
  }, [data, query]);

  return { connected: data ? data.connected : null, invoices: data?.invoices ?? [], shown, error };
}

export interface EcwidOrderSearch {
  /** `null` until a search has answered. */
  connected: boolean | null;
  orders: EcwidOrderImport[];
  loading: boolean;
  error: string | null;
  /** The query is long enough to search (≥ 2 characters). */
  searching: boolean;
}

const ECWID_SEARCH_DEBOUNCE_MS = 250;

export function useEcwidOrderSearch(query: string): EcwidOrderSearch {
  const q = query.trim();
  const [data, setData] = useState<{ connected: boolean; orders: EcwidOrderImport[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.length < 2) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/orders/intake/ecwid-orders?q=${encodeURIComponent(q)}`, { credentials: 'same-origin', signal: ctrl.signal })
        .then((res) => res.json())
        .then((body: { ok?: boolean; error?: string; connected?: boolean; orders?: EcwidOrderImport[] }) => {
          if (!body.ok) throw new Error(body.error || 'Ecwid did not answer.');
          setData({ connected: body.connected === true, orders: body.orders ?? [] });
          setError(null);
        })
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Ecwid did not answer.');
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, ECWID_SEARCH_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [q]);

  return { connected: data ? data.connected : null, orders: data?.orders ?? [], loading, error, searching: q.length >= 2 };
}
