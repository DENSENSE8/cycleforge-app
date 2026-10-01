'use client';

/**
 * Missing pairs, placeholder side — pair a floor-minted `TMP-` SKU into the
 * real Zoho item: its stock, photos and description move onto the real SKU
 * and the exception closes (`merge-placeholder`).
 */

import { useMemo, useState } from 'react';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { useResolvePairsException } from '@/hooks/exceptions';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Pair to Zoho SKU — the resolution. Its one action, **Pair**, sits top-right once an item is chosen. */
export function SkuExceptionPairSection({
  fieldId,
  item,
  onPaired,
}: {
  fieldId: string;
  item: ProvisionalSkuDetail;
  /** After the merge lands (the hook has already re-read the exceptions). */
  onPaired: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<SkuCatalogItem | null>(null);
  const merge = useResolvePairsException();
  const busy = merge.isPending;
  // The phone reads Pair at the 44px touch rung.
  const { isMobile } = useUIModeOptional();

  // Seeded with the typed name: the likeliest real SKU is whatever the catalog
  // already calls the thing the operator described.
  const effectiveQuery = useDebounce((query || item.productTitle).trim(), 250);
  const search = useSkuCatalogSearch(effectiveQuery, { limit: 20, searchField: 'zoho_catalog' });
  const hits = useMemo(
    // A placeholder cannot merge into itself, and TMP→TMP is refused by the endpoint.
    () => (search.data ?? []).filter((hit) => hit.sku !== item.sku && !isProvisionalSku(hit.sku)),
    [item.sku, search.data],
  );

  const confirm = () => {
    if (!chosen || busy) return;
    merge.mutate(
      { action: 'merge-placeholder', provisionalSku: item.sku, targetSku: chosen.sku },
      {
        onSuccess: () => {
          toast.success(`Paired ${item.sku} into ${chosen.sku}`);
          void onPaired();
        },
        onError: (error) => toast.error(error.message || 'Could not pair.'),
      },
    );
  };

  const units = `${item.stock} unit${item.stock === 1 ? '' : 's'}`;

  return (
    <RecordGroup
      title="Pair to Zoho SKU"
      testId="sku-exception-pair"
      action={
        chosen ? (
          <Button variant="ink" size={isMobile ? 'lg' : 'sm'} loading={busy} onClick={confirm} data-testid="sku-exception-pair-confirm">
            Pair
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(RECORD_ID_CLASS, 'shrink-0 text-mode-ink')}
            data-testid="sku-exception-pair-current"
            title="Current SKU"
          >
            {item.sku}
          </span>
          <span className="shrink-0 text-role-caption text-mode-muted" aria-hidden>
            →
          </span>
          <IntakeCombobox
            triggerId={`${fieldId}-pair`}
            className={cn(EVIDENCE_CONTROL_CLASS, 'min-w-0 flex-1')}
            contentClassName="overflow-hidden rounded-mode"
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
        </div>
        {chosen ? (
          <p className="text-role-data text-mode-ink" data-testid="sku-exception-pair-preview">
            {units} become{item.stock === 1 ? 's' : ''}{' '}
            <span className="font-semibold">{chosen.product_title || chosen.sku}</span>{' '}
            <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>{chosen.sku}</span>
          </p>
        ) : (
          <p className="text-role-caption text-mode-muted">
            Pairing moves the stock, photos and description onto the real SKU and closes this exception.
          </p>
        )}
      </div>
    </RecordGroup>
  );
}
