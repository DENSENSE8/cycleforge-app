'use client';

/**
 * Phone-first shipped lookup over the canonical shipped search API. A row opens
 * the PACKAGE hub (`/m/shipping/shipments/<id>`) it shipped in; a tracking
 * number that names a package no order row carries (an unmatched pack scan)
 * still lands as its own package row through the tracking lookup.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, History } from '@/components/Icons';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import { EmptyState, Inset, SearchField } from '@/design-system/primitives';
import { useShippedSearch } from '@/hooks/useShippedSearch';
import { getLast8 } from '@/lib/copy-chip-format';
import { shippedOrdersAsWorkRows } from '@/lib/work-orders/shipped-as-work-row';
import { toShipConditionParts, toShipExpectedQty, toShipPriceText } from '@/components/mobile/redesign/to-ship-faces';
import { shipmentItemsTitle } from '@/components/mobile/shipping/shipment/shipment-faces';
import { shipmentHubHref } from '@/components/mobile/shipping/shipment/useShipmentHub';
import { lookupShipmentByTracking, useShipmentRecord } from '@/lib/shipments/shipment-record-client';

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
  // A tracking-shaped query may name a package with no shipped order row (an
  // unmatched pack scan); the package lookup finds it. Short text never asks.
  const trackingLookup = useQuery({
    queryKey: ['shipment-lookup', debounced],
    queryFn: () => lookupShipmentByTracking(debounced),
    enabled: /^[A-Za-z0-9]{8,}$/.test(debounced),
    staleTime: 30_000,
  });
  const lookedUpId = trackingLookup.data?.shipmentId ?? null;
  const lookedUpTracking = trackingLookup.data?.tracking.toUpperCase() ?? null;
  // A row with no package id of its own (the unmatched-scan exception row) that
  // carries the looked-up tracking IS that package: it opens the hub.
  const rowShipmentId = (row: (typeof rows)[number]): number | null => {
    const own = Number(row.shipmentId);
    if (own > 0) return own;
    return lookedUpId != null && row.trackingNumber?.toUpperCase() === lookedUpTracking ? lookedUpId : null;
  };
  const packageOnly =
    lookedUpId != null && !rows.some((row) => rowShipmentId(row) === lookedUpId) ? lookedUpId : null;
  const lookedUp = useShipmentRecord(packageOnly);
  const packageRecord = packageOnly != null ? (lookedUp.data ?? null) : null;
  const total = rows.length + (packageRecord ? 1 : 0);

  return (
    <div
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
        ) : shipped.isPending && !packageRecord ? (
          <p className="border-b border-border-hairline px-3 py-4 text-role-caption text-text-muted">
            Searching shipped orders…
          </p>
        ) : shipped.isError && !packageRecord ? (
          <EmptyState
            tone="danger"
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Couldn't search shipped orders"
            description="Check the identifier and try again."
          />
        ) : total === 0 ? (
          <EmptyState
            title="No shipped order found"
            description={`Nothing matched “${debounced}”.`}
          />
        ) : (
          <>
            <p className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-muted">
              {total} shipped {total === 1 ? 'record' : 'records'}
            </p>
            <ul className="flex flex-col">
              {packageRecord ? (
                <li key={`package-${packageRecord.shipmentId}`}>
                  <ItemCardRow
                    title={shipmentItemsTitle(packageRecord)}
                    imageUrl={packageRecord.items[0]?.photoUrl ?? null}
                    reference={`Package  ${getLast8(packageRecord.tracking)}`}
                    onOpen={() => router.push(shipmentHubHref(packageRecord.shipmentId))}
                    ariaLabel={`Open package ${packageRecord.tracking}`}
                    primary={null}
                  />
                </li>
              ) : null}
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
                    onOpen={() => {
                      const shipmentId = rowShipmentId(row);
                      router.push(
                        shipmentId != null
                          ? shipmentHubHref(shipmentId)
                          : `/m/orders/${encodeURIComponent(String(row.orderId ?? row.entityId))}`,
                      );
                    }}
                    ariaLabel={`Open the package for shipped order ${row.orderId ?? row.recordLabel}`}
                    primary={null}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
