'use client';

/**
 * Customer (phone face) — find a customer by name, phone or email, or type a
 * new one, then the ship-to. Search and the hit → customer mapping live in
 * `useCustomerSearch`; this paints them as full-bleed rows. The shell owns
 * the title and the Back / Continue dock.
 */

import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { MobileFormHeading } from './MobileFormHeading';
import { customerCleared, customerFromHit, useCustomerSearch } from '@/hooks/orders/useCustomerSearch';
import type { IntakeState } from '@/lib/orders/intake/intake-model';

type Customer = IntakeState['customer'];

/** A touch row in the form's triage voice — press washes the row, never inverts it. */
const HIT_ROW_CLASS =
  'group flex min-h-mode-hit-cta w-full flex-col justify-center border-b border-mode-rule px-mode-page py-2.5 text-left last:border-b-0 active:bg-mode-hover';

export function MobileCustomerStep({
  customer,
  onChange,
  pickup,
}: {
  customer: Customer;
  onChange: (next: Customer) => void;
  /** Counter pickup — nothing ships, so the ship-to is optional. */
  pickup: boolean;
}) {
  const { query, setQuery, hits, loading, searched } = useCustomerSearch();
  const set = (patch: Partial<Customer>) => onChange({ ...customer, ...patch });
  const setShip = (key: keyof Customer['shipTo']) => (value: string) =>
    onChange({ ...customer, shipTo: { ...customer.shipTo, [key]: value } });

  return (
    <div className="divide-y divide-mode-rule bg-mode-panel" data-testid="m-order-customer">
      {customer.id == null ? (
        <>
          <section aria-labelledby="m-order-customer-find">
            <MobileFormHeading id="m-order-customer-find">Find a customer</MobileFormHeading>
            <div className="px-mode-page py-3">
              <TextField
                label="Name, phone or email"
                value={query}
                onChange={setQuery}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                data-testid="m-order-customer-query"
              />
            </div>
            {searched ? (
              loading && hits.length === 0 ? (
                <p className="px-mode-page pb-3 text-role-caption text-mode-muted">Searching…</p>
              ) : hits.length === 0 ? (
                <p className="px-mode-page pb-3 text-role-caption text-mode-muted">No customer matches — type a new one below.</p>
              ) : (
                <ul aria-label="Matching customers" className="border-t border-mode-rule">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(customerFromHit(hit));
                          setQuery('');
                        }}
                        className={HIT_ROW_CLASS}
                        data-testid="m-order-customer-hit"
                      >
                        <span className="block truncate text-mode-body font-semibold text-mode-ink">
                          {hit.name}
                        </span>
                        <span className="block truncate text-role-caption text-mode-muted">
                          {[hit.phone, hit.email].filter(Boolean).join(' · ') || 'No contact on file'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </section>

          <section aria-labelledby="m-order-customer-new">
            <MobileFormHeading id="m-order-customer-new">New customer</MobileFormHeading>
            <div className="space-y-3 px-mode-page py-3">
              <TextField
                label="Name"
                value={customer.name}
                onChange={(v) => set({ name: v })}
                autoComplete="name"
                autoCapitalize="words"
                data-testid="m-order-customer-name"
              />
              <TextField
                label="Phone"
                value={customer.phone}
                onChange={(v) => set({ phone: v })}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                data-testid="m-order-customer-phone"
              />
              <TextField
                label="Email"
                value={customer.email}
                onChange={(v) => set({ email: v })}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                data-testid="m-order-customer-email"
              />
            </div>
          </section>
        </>
      ) : (
        <div className="flex min-h-mode-hit-cta items-center gap-3 px-mode-page py-2.5" data-testid="m-order-customer-picked">
          <div className="min-w-0 flex-1">
            <p className="truncate text-mode-body font-semibold text-mode-ink">{customer.name}</p>
            <p className="truncate text-role-caption text-mode-muted">
              {[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact on file'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => onChange(customerCleared(customer))} data-testid="m-order-customer-change">
            Change
          </Button>
        </div>
      )}

      <section aria-labelledby="m-order-customer-ship">
        <MobileFormHeading id="m-order-customer-ship">{pickup ? 'Ship to · optional for pickup' : 'Ship to'}</MobileFormHeading>
        <div className="space-y-3 px-mode-page py-3">
          <TextField
            label="Street address"
            value={customer.shipTo.address1}
            onChange={setShip('address1')}
            autoComplete="address-line1"
            data-testid="m-order-ship-address1"
          />
          <TextField
            label="Apt, suite"
            value={customer.shipTo.address2}
            onChange={setShip('address2')}
            autoComplete="address-line2"
            data-testid="m-order-ship-address2"
          />
          <TextField
            label="City"
            value={customer.shipTo.city}
            onChange={setShip('city')}
            autoComplete="address-level2"
            data-testid="m-order-ship-city"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="State"
              value={customer.shipTo.state}
              onChange={setShip('state')}
              autoComplete="address-level1"
              autoCapitalize="characters"
              data-testid="m-order-ship-state"
            />
            <TextField
              label="ZIP"
              value={customer.shipTo.postalCode}
              onChange={setShip('postalCode')}
              autoComplete="postal-code"
              data-testid="m-order-ship-zip"
            />
          </div>
          <TextField
            label="Country"
            value={customer.shipTo.country}
            onChange={setShip('country')}
            autoComplete="country"
            autoCapitalize="characters"
            data-testid="m-order-ship-country"
          />
        </div>
      </section>
    </div>
  );
}
