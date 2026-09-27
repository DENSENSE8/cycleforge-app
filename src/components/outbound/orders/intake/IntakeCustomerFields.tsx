'use client';

/**
 * Customer: find an existing one (name, phone or email — `GET
 * /api/customers/search`) or type a new one, then the ship-to. A picked
 * customer keeps its record (create sends only its id + the ship-to); the
 * contact fields reopen for a new customer with "New customer".
 */

import { useEffect, useState } from 'react';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { TextField } from '@/design-system/primitives/TextField';
import { Button } from '@/design-system/primitives/Button';
import type { IntakeState } from './intake-model';

type Customer = IntakeState['customer'];

interface CustomerHit {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  shippingAddress: Record<'address1' | 'address2' | 'city' | 'state' | 'postalCode' | 'country', string | null>;
}

/** Debounce between keystrokes and the customer search. */
const SEARCH_DEBOUNCE_MS = 200;

export function IntakeCustomerFields({
  customer,
  onChange,
}: {
  customer: Customer;
  onChange: (next: Customer) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
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

  const pick = (hit: CustomerHit) => {
    const a = hit.shippingAddress;
    onChange({
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
    });
  };
  const set = (patch: Partial<Customer>) => onChange({ ...customer, ...patch });
  const setShip = (key: keyof Customer['shipTo']) => (value: string) =>
    onChange({ ...customer, shipTo: { ...customer.shipTo, [key]: value } });

  return (
    <div className="space-y-3" data-testid="intake-customer">
      {customer.id == null ? (
        <>
          <SearchableSelectField<CustomerHit>
            value={null}
            onChange={(_v, option) => option?.data && pick(option.data)}
            options={hits.map((h) => ({
              value: h.id,
              label: h.name,
              meta: [h.phone, h.email].filter(Boolean).join(' · '),
              data: h,
            }))}
            onSearchChange={setQuery}
            loading={loading}
            placeholder="Find a customer — name, phone or email"
            searchPlaceholder="Name, phone or email"
            emptyMessage={query.trim().length < 2 ? 'Type at least two characters' : 'No customer matches — type a new one below'}
            ariaLabel="Find a customer"
            testId="intake-customer-search"
            className="h-11 rounded-mode-control px-3.5 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Name" value={customer.name} onChange={(v) => set({ name: v })} autoComplete="off" data-testid="intake-customer-name" />
            <TextField label="Phone" value={customer.phone} onChange={(v) => set({ phone: v })} inputMode="tel" autoComplete="off" data-testid="intake-customer-phone" />
            <TextField label="Email" value={customer.email} onChange={(v) => set({ email: v })} inputMode="email" autoComplete="off" data-testid="intake-customer-email" />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-mode-control bg-surface-sunken px-3 py-2.5" data-testid="intake-customer-existing">
          <div className="min-w-0 flex-1">
            <p className="truncate text-role-body font-medium text-text-default">{customer.name}</p>
            <p className="truncate text-role-caption text-text-muted">
              {[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact on file'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...customer, id: null, name: '', phone: '', email: '' })}
            data-testid="intake-customer-change"
          >
            New customer
          </Button>
        </div>
      )}

      <p className="mode-label pt-1 text-text-soft">Ship to</p>
      <div className="grid gap-3 sm:grid-cols-6">
        <TextField label="Street address" value={customer.shipTo.address1} onChange={setShip('address1')} className="sm:col-span-4" autoComplete="off" data-testid="intake-ship-address1" />
        <TextField label="Apt, suite" value={customer.shipTo.address2} onChange={setShip('address2')} className="sm:col-span-2" autoComplete="off" />
        <TextField label="City" value={customer.shipTo.city} onChange={setShip('city')} className="sm:col-span-2" autoComplete="off" data-testid="intake-ship-city" />
        <TextField label="State" value={customer.shipTo.state} onChange={setShip('state')} className="sm:col-span-1" autoComplete="off" data-testid="intake-ship-state" />
        <TextField label="ZIP" value={customer.shipTo.postalCode} onChange={setShip('postalCode')} className="sm:col-span-2" autoComplete="off" data-testid="intake-ship-zip" />
        <TextField label="Country" value={customer.shipTo.country} onChange={setShip('country')} className="sm:col-span-1" autoComplete="off" />
      </div>
    </div>
  );
}
