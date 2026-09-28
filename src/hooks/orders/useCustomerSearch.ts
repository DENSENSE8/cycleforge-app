'use client';

/**
 * Customer find for a new sales order — shared by the desk and phone faces.
 * Name, phone or email over `GET /api/customers/search`, debounced; a picked
 * hit becomes the order's customer through {@link customerFromHit}.
 */

import { useEffect, useState } from 'react';
import type { IntakeState } from '@/lib/orders/intake/intake-model';

type Customer = IntakeState['customer'];

export interface CustomerHit {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  shippingAddress: Record<'address1' | 'address2' | 'city' | 'state' | 'postalCode' | 'country', string | null>;
}

/** Debounce between keystrokes and the customer search. */
const SEARCH_DEBOUNCE_MS = 200;
/** Below this many characters the search does not run. */
export const CUSTOMER_QUERY_MIN = 2;

export function useCustomerSearch() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < CUSTOMER_QUERY_MIN) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(q)}&limit=8`, { credentials: 'same-origin', signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: { customers?: CustomerHit[] }) => setHits(data.customers ?? []))
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  /** True once the query is long enough to have searched. */
  const searched = query.trim().length >= CUSTOMER_QUERY_MIN;
  return { query, setQuery, hits, loading, searched };
}

/** A picked hit as the order's customer: its record id, contact and saved ship-to. */
export function customerFromHit(hit: CustomerHit): Customer {
  const a = hit.shippingAddress;
  return {
    id: hit.id,
    name: hit.name,
    phone: hit.phone ?? '',
    email: hit.email ?? '',
    shipTo: {
      address1: a.address1 ?? '',
      address2: a.address2 ?? '',
      city: a.city ?? '',
      state: a.state ?? '',
      postalCode: a.postalCode ?? '',
      country: a.country ?? 'US',
    },
  };
}

/** "New customer": drop the record and its contact, keep the ship-to typed so far. */
export function customerCleared(customer: Customer): Customer {
  return { ...customer, id: null, name: '', phone: '', email: '' };
}
