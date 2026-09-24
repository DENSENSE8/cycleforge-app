'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import type { PickedCustomer } from '@/lib/repair/repair-info-edit';
import { CUSTOMER_SEARCH_MIN_CHARS, useCustomerSearch } from './useCustomerSearch';

/**
 * Level-1 picker over `RepairInfoEditSheet`: search the org's customers (name,
 * phone or email) and pick one, or start a new customer record. It only
 * reports the choice — the edit sheet stages it and Save writes it.
 */
export function RepairCustomerPickerSheet({
  open,
  linkedCustomerId,
  onPick,
  onCreate,
  onClose,
}: {
  open: boolean;
  /** The customer the repair points at now — shown, not pickable. */
  linkedCustomerId: number | null;
  onPick: (customer: PickedCustomer) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);
  const { results, loading, error, active } = useCustomerSearch(open, query);

  let status: string | null = null;
  if (!active) status = `Type at least ${CUSTOMER_SEARCH_MIN_CHARS} characters of a name, phone or email.`;
  else if (loading) status = 'Searching…';
  else if (error) status = `Search failed — ${error}`;

  return (
    <BottomSheet open={open} onClose={onClose} forceVariant="sheet" title="Change customer" level={1} dragDisabled>
      <ModeRegion mode="triage" className="flex min-h-0 flex-1 flex-col gap-3 pb-2 pt-2">
        <Command shouldFilter={false} className="rounded-mode border border-mode-edge">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Name, phone or email"
            inputMode="search"
            aria-label="Search customers"
            className="h-11 text-base"
          />
          <CommandList className="max-h-[45vh]">
            {status ? (
              <p role={error ? 'alert' : 'status'} className="px-3 py-3 text-center text-role-caption text-mode-muted">
                {status}
              </p>
            ) : (
              <CommandEmpty>No customer matches “{query.trim()}”.</CommandEmpty>
            )}
            {results.map((customer) => {
              const linked = customer.id === linkedCustomerId;
              return (
                <CommandItem
                  key={customer.id}
                  value={String(customer.id)}
                  disabled={linked}
                  onSelect={() => onPick(customer)}
                  className="min-h-12 border-b border-mode-edge last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-mode-ink">{customer.name}</span>
                    <span className="truncate text-role-caption text-mode-muted">
                      {[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No phone or email'}
                    </span>
                  </span>
                  {linked ? <span className="shrink-0 text-role-caption font-semibold text-mode-muted">Linked now</span> : null}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
        <Button variant="secondary" size="lg" className="w-full rounded-mode" onClick={onCreate}>
          New customer
        </Button>
      </ModeRegion>
    </BottomSheet>
  );
}
