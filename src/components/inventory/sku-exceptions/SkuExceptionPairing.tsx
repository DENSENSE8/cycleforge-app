'use client';

/**
 * Pair to Zoho SKU — the resolution. Pick the real item out of the Zoho
 * mirror, read what will be true afterwards ("N units become X"), confirm.
 *
 * The merge endpoint moves every bin, ledger row, photo and the description
 * onto the real SKU and retires the placeholder, so on success the record no
 * longer exists and the host returns to the queue.
 */

import { useMemo, useState } from 'react';
import { Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import {
  TRIAGE_PANEL_INNER_CORNER,
  triagePanelControl,
} from '@/design-system/tokens/triage-panel';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function SkuExceptionPairing({
  fieldId,
  item,
  onPaired,
}: {
  fieldId: string;
  item: ProvisionalSkuDetail;
  onPaired: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<SkuCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);

  // Seeded with the typed name: the likeliest real SKU is whatever the catalog
  // already calls the thing the operator described.
  const effectiveQuery = useDebounce((query || item.productTitle).trim(), 250);
  const search = useSkuCatalogSearch(effectiveQuery, { limit: 20, searchField: 'zoho_catalog' });
  const hits = useMemo(
    // A placeholder cannot merge into itself, and TMP→TMP is refused by the endpoint.
    () => (search.data ?? []).filter((hit) => hit.sku !== item.sku && !isProvisionalSku(hit.sku)),
    [item.sku, search.data],
  );

  const confirm = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/sku-catalog/provisional/merge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provisionalSku: item.sku, targetSku: chosen.sku }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) throw new Error(data?.error || `Pairing failed (${res.status})`);
      toast.success(`Paired ${item.sku} into ${chosen.sku}`);
      await onPaired();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not pair.');
      setBusy(false);
    }
  };

  const units = `${item.stock} unit${item.stock === 1 ? '' : 's'}`;

  return (
    <div className="space-y-4">
      <IntakeCombobox
        triggerId={`${fieldId}-pair`}
        className={triagePanelControl('w-full')}
        contentClassName={cn('overflow-hidden', TRIAGE_PANEL_INNER_CORNER)}
        value={chosen?.sku ?? null}
        onChange={(value) => setChosen(hits.find((hit) => hit.sku === value) ?? null)}
        options={hits.map((hit) => ({
          value: hit.sku,
          label: hit.sku,
          mono: true,
          meta: hit.product_title || undefined,
          imageUrl: hit.image_url,
        }))}
        query={query}
        onQueryChange={setQuery}
        loading={search.isFetching}
        disabled={busy}
        placeholder="Find the real Zoho item…"
        searchPlaceholder="Search Zoho by SKU or title…"
        emptyMessage={search.isFetching ? 'Searching…' : 'Nothing in Zoho matches.'}
        ariaLabel="Zoho item to pair this SKU into"
        testId="sku-exception-pair-search"
      />
      {chosen ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto min-w-0 text-role-body text-text-default">
            {units} become{item.stock === 1 ? 's' : ''}{' '}
            <span className="font-semibold">{chosen.product_title || chosen.sku}</span>{' '}
            <span className="font-mono text-text-soft">{chosen.sku}</span>
          </p>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setChosen(null)}>
            Choose differently
          </Button>
          <Button
            variant="execute"
            size="sm"
            icon={<Check />}
            loading={busy}
            onClick={() => void confirm()}
            data-testid="sku-exception-pair-confirm"
          >
            Pair
          </Button>
        </div>
      ) : (
        <p className="text-role-caption text-text-soft">
          Pairing moves the stock, photos and description onto the real SKU and closes this exception.
        </p>
      )}
    </div>
  );
}
