'use client';

/**
 * `/m/on-hold` — SKU exceptions: every floor-minted placeholder (`TMP-…`) still
 * waiting on its real Zoho SKU.
 *
 * A placeholder with a count on it is a promise someone made on the floor
 * ("this is real, we have N") that the catalog has not answered yet. This
 * screen is the list of open promises; each row opens the record, where the
 * photos, counts and the pairing live.
 *
 * Search filters the list itself rather than querying anything: the set is
 * small (it is a to-do list, not a catalog), and the person scanning it is
 * looking for the thing they just remembered, not discovering inventory.
 *
 * Live: the desk and other phones write to the same records, so the list
 * listens for `sku-exception.changed` and stock deltas.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileTriagePage, type TriageSection } from '@/components/mobile/triage/MobileTriagePage';
import { TriageRow } from '@/components/mobile/triage/TriageRow';
import { OnHoldBadge } from '@/components/mobile/pair/OnHoldBadge';
import { useProvisionalSkus, useSkuExceptionsRealtime } from '@/hooks/useProvisionalSkus';
import { mobileSkuExceptionHref } from '@/lib/inventory/sku-exception-links';
import { photoContentUrl } from '@/lib/photos/display-url';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function MobileOnHoldList() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  useSkuExceptionsRealtime();
  const { data: items = [], isLoading, isError } = useProvisionalSkus();

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle
        ? items.filter(
            (item) =>
              item.sku.toLowerCase().includes(needle) ||
              item.productTitle.toLowerCase().includes(needle) ||
              item.barcode.toLowerCase().includes(needle),
          )
        : items,
    [items, needle],
  );

  const sections: TriageSection[] = useMemo(
    () => [
      {
        heading: 'Waiting on a real SKU',
        count: visible.length,
        empty: isLoading
          ? 'Loading…'
          : isError
            ? 'Could not load SKU exceptions.'
            : needle
              ? `Nothing matches “${query.trim()}”`
              : 'No open SKU exceptions — every placeholder is paired.',
        rows: visible.map((item) => (
          <TriageRow
            key={item.sku}
            title={item.productTitle}
            meta={
              <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
                {item.sku}
                {item.stock > 0 ? ` · ${item.stock} on hand` : ' · no stock'}
                {` · ${plural(item.locations.length, 'location')} · ${plural(item.photoCount, 'photo')}`}
              </span>
            }
            imageUrl={item.coverPhotoId != null ? photoContentUrl(item.coverPhotoId, 'thumb') : null}
            badge={<OnHoldBadge />}
            actionLabel="Pair"
            actionName={`Pair ${item.productTitle} to a Zoho SKU`}
            inspectName={`Open ${item.productTitle}`}
            onInspect={() => router.push(mobileSkuExceptionHref(item.sku))}
            onAction={() => router.push(`${mobileSkuExceptionHref(item.sku)}/pair`)}
          />
        )),
      },
    ],
    [isError, isLoading, needle, query, router, visible],
  );

  return (
    <MobileTriagePage
      title="SKU exceptions"
      subtitle={plural(items.length, 'product')}
      backHref="/m/work"
      query={query}
      onQueryChange={setQuery}
      searchLabel="Filter by title, SKU or barcode"
      sections={sections}
    />
  );
}
