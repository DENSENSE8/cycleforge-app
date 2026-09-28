'use client';

/**
 * Customer: find an existing one (name, phone or email — `GET
 * /api/customers/search`) or type a new one, then the ship-to. A picked
 * customer keeps its record (create sends only its id + the ship-to); the
 * contact fields reopen for a new customer with "New customer".
 */

import { customerCleared, customerFromHit, useCustomerSearch, type CustomerHit } from '@/hooks/orders/useCustomerSearch';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { TextField } from '@/design-system/primitives/TextField';
import { Button } from '@/design-system/primitives/Button';
import type { IntakeState } from '@/lib/orders/intake/intake-model';

type Customer = IntakeState['customer'];

export function IntakeCustomerFields({
  customer,
  onChange,
  autoFocus = false,
}: {
  customer: Customer;
  onChange: (next: Customer) => void;
  /** Land the cursor on "Find a customer" as the surface opens (the new-order page). */
  autoFocus?: boolean;
}) {
  const { setQuery, hits, loading, searched } = useCustomerSearch();

  const set = (patch: Partial<Customer>) => onChange({ ...customer, ...patch });
  const setShip = (key: keyof Customer['shipTo']) => (value: string) =>
    onChange({ ...customer, shipTo: { ...customer.shipTo, [key]: value } });

  return (
    <div className="space-y-3" data-testid="intake-customer">
      {customer.id == null ? (
        <>
          <SearchableSelectField<CustomerHit>
            value={null}
            onChange={(_v, option) => option?.data && onChange(customerFromHit(option.data))}
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
            emptyMessage={searched ? 'No customer matches — type a new one below' : 'Type at least two characters'}
            ariaLabel="Find a customer"
            autoFocus={autoFocus}
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
            onClick={() => onChange(customerCleared(customer))}
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
