'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, User } from '@/components/Icons';
import { useMobileV2Search } from '@/components/mobile/v2/MobileV2SearchContext';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { MobileDataListRow } from '@/design-system/components/MobileDataListRow';
import { sourcePlatformLabel } from '@/lib/source-platform';
import type { CustomerDirectoryPayload } from '@/lib/customers/customer-throughput';
import { customerMobilePath } from '@/lib/nav/route-tree';

async function loadCustomers(query: string): Promise<CustomerDirectoryPayload> {
  const params = new URLSearchParams({ limit: '50' });
  if (query.trim()) params.set('q', query.trim());
  const res = await fetch(`/api/customers?${params.toString()}`, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not load customers');
  return json as CustomerDirectoryPayload;
}

function dateFace(value: string | null): string {
  if (!value) return 'No orders';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function platformFace(value: string): string {
  const label = sourcePlatformLabel(value);
  if (label !== 'Unknown') return label;
  const raw = value.trim().replace(/[_-]+/g, ' ');
  return raw ? raw.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown';
}

/** `/m/customers` — recent buyers first, searchable by name, phone, or email. */
export function CustomersScreen() {
  const { query } = useMobileV2Search();
  const customers = useQuery({
    queryKey: ['customers.directory', query.trim()],
    queryFn: () => loadCustomers(query),
    staleTime: 30_000,
  });
  const rows = customers.data?.customers ?? [];

  return (
    <div className="flex min-h-full flex-col bg-surface-card" data-testid="mobile-customers">
      {customers.isPending && rows.length === 0 ? null : customers.isError ? (
        <p role="alert" className="px-mode-page py-10 text-center text-role-data font-semibold text-text-danger">
          Couldn&apos;t load customers.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-mode-page py-10 text-center text-role-data font-semibold text-mode-muted">
          No customers match that contact.
        </p>
      ) : (
        <ul className="divide-y divide-border-soft" aria-label="Customers" aria-busy={customers.isFetching || undefined}>
          {rows.map((customer) => {
            const repeat = customer.orderCount > 1;
            const contact = customer.phone || customer.email || customer.place || 'No contact on file';
            return (
              <li key={customer.id}>
                <MobileDataListRow
                  href={customerMobilePath(customer.id)}
                  className="flex items-center gap-3 px-mode-page py-2.5"
                  ariaLabel={`Open ${customer.name}, ${customer.orderCount} orders`}
                  testId="mobile-customer-row"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-muted ring-1 ring-inset ring-mode-rule">
                    <User className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-role-data font-semibold text-text-default">{customer.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-role-caption text-mode-muted">{contact}</span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-role-micro font-semibold text-mode-muted">
                      <span className={repeat ? 'text-text-warning' : ''}>
                        {repeat ? `Repeat · ${customer.orderCount} orders` : `${customer.orderCount} order${customer.orderCount === 1 ? '' : 's'}`}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="truncate">Latest {dateFace(customer.lastOrderAt)}</span>
                    </span>
                  </span>
                  <span className="flex max-w-20 shrink-0 flex-col items-end gap-1">
                    {customer.platforms.slice(0, 2).map((platform) => (
                      <span key={platform} className="flex items-center text-role-micro font-semibold text-mode-muted">
                        <PlatformMark platformValue={platform} />
                        {platformFace(platform)}
                      </span>
                    ))}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-text-faint" aria-hidden />
                </MobileDataListRow>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
