'use client';

/**
 * `/m/on-hold` — the reconcile queue: every placeholder still holding stock.
 *
 * A placeholder with a count on it is a promise someone made on the floor
 * ("this is real, we have N") that the catalog has not answered yet. This
 * screen is the list of open promises, and merging one is the act of keeping
 * it — which is why Merge is the row's action, not a footnote behind a ⋯ menu.
 *
 * Search filters the list itself rather than querying anything: the set is
 * small (it is a to-do list, not a catalog), and the person scanning it is
 * looking for the thing they just remembered, not discovering inventory.
 *
 * Mounts the triage pattern (`MobileTriagePage` + `TriageRow`) rather than a
 * bespoke list — per the standing rule that find-one-thing-then-act is ONE
 * surface across the app, not a fresh one per screen.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileTriagePage, type TriageSection } from '@/components/mobile/triage/MobileTriagePage';
import { TriageRow } from '@/components/mobile/triage/TriageRow';
import { OnHoldBadge } from '@/components/mobile/pair/OnHoldBadge';
import { useProvisionalSkus } from './use-provisional-skus';

export function MobileOnHoldList() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const { data: items = [], isLoading } = useProvisionalSkus();

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
        empty: isLoading ? 'Loading…' : needle ? `Nothing on hold matches “${query.trim()}”` : 'Nothing is on hold — every placeholder is reconciled.',
        rows: visible.map((item) => (
          <TriageRow
            key={item.sku}
            title={item.productTitle}
            meta={
              <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
                {item.sku}
                {item.stock > 0 ? ` · ${item.stock} on hand` : ' · no stock'}
              </span>
            }
            badge={<OnHoldBadge />}
            actionLabel="Merge"
            actionName={`Merge ${item.productTitle} into a real SKU`}
            inspectName={`Details for ${item.productTitle}`}
            onInspect={() => router.push(`/m/on-hold/${encodeURIComponent(item.sku)}`)}
            onAction={() => router.push(`/m/on-hold/${encodeURIComponent(item.sku)}`)}
          />
        )),
      },
    ],
    [isLoading, needle, query, router, visible],
  );

  return (
    <MobileTriagePage
      title="On hold"
      subtitle={`${items.length} product${items.length === 1 ? '' : 's'}`}
      backHref="/m/work"
      query={query}
      onQueryChange={setQuery}
      searchLabel="Filter on-hold products"
      sections={sections}
    />
  );
}
