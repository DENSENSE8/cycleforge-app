'use client';

/** Phone-first shipped-order lookup over the canonical shipped search API. */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, History } from '@/components/Icons';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import { EmptyState, Inset, SearchField } from '@/design-system/primitives';
import { useShippedSearch } from '@/hooks/useShippedSearch';
import { getLast8 } from '@/lib/copy-chip-format';
import { shippedOrdersAsWorkRows } from '@/lib/work-orders/shipped-as-work-row';
import { toShipConditionParts, toShipExpectedQty, toShipPriceText } from '@/components/mobile/redesign/to-ship-faces';

export function MobileShippedHistory() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const shipped = useShippedSearch({ query: debounced, shippedFilter: 'orders' });
  const rows = useMemo(
    () => shippedOrdersAsWorkRows(shipped.data?.records ?? []),
    [shipped.data?.records],
  );

  return (
    <main
      className="flex h-full min-h-0 flex-col bg-surface-card"
      data-testid="mobile-shipped-history"
    >
      <div className="border-b border-border-hairline bg-surface-card">
        <Inset space="chip">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Order, tracking, serial, SKU…"
            tone="neutral"
            hideUnderline
            isSearching={shipped.isFetching && Boolean(debounced)}
          />
        </Inset>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!debounced ? (
          <EmptyState
            icon={<History className="h-6 w-6 text-text-soft" />}
            title="Find a shipped order"
            description="Search an order number, tracking number, serial, SKU, or item number."
          />
        ) : shipped.isPending ? (
          <p className="border-b border-border-hairline px-3 py-4 text-role-caption text-text-muted">
            Searching shipped orders…
          </p>
        ) : shipped.isError ? (
          <EmptyState
            tone="danger"
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Couldn't search shipped orders"
            description="Check the identifier and try again."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No shipped order found"
            description={`Nothing matched “${debounced}”.`}
          />
        ) : (
          <>
            <p className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-muted">
              {rows.length} shipped {rows.length === 1 ? 'order' : 'orders'}
            </p>
            <ul className="flex flex-col">
              {rows.map((row) => (
                <li key={row.id}>
                  <ItemCardRow
                    title={row.title}
                    imageUrl={row.imageUrl}
                    reference={
                      row.trackingNumber
                        ? `${row.orderId ?? row.recordLabel}  ${getLast8(row.trackingNumber)}`
                        : (row.orderId ?? row.recordLabel)
                    }
                    qty={toShipExpectedQty(row)}
                    price={toShipPriceText(row)}
                    condition={toShipConditionParts(row)}
                    onOpen={() =>
                      router.push(
                        `/m/orders/${encodeURIComponent(String(row.orderId ?? row.entityId))}`,
                      )
                    }
                    ariaLabel={`Open shipped order ${row.orderId ?? row.recordLabel}`}
                    primary={null}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
