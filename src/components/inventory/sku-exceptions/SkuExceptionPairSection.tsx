'use client';

/**
 * Missing pairs, placeholder side — pair a floor-minted `TMP-` SKU into the
 * real Zoho item: its stock, photos and description move onto the real SKU
 * and the exception closes (`merge-placeholder`).
 */

import { useMemo, useState } from 'react';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import {
  EVIDENCE_CONTROL_CLASS,
  EvidenceSection,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { useResolvePairsException } from '@/hooks/exceptions';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Pair to Zoho SKU — the resolution. */
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
    <EvidenceSection label="Pair to Zoho SKU" testId="sku-exception-pair">
      <IntakeCombobox
        triggerId={`${fieldId}-pair`}
        className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
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
      {chosen ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-role-data text-mode-ink">
            {units} become{item.stock === 1 ? 's' : ''}{' '}
            <span className="font-semibold">{chosen.product_title || chosen.sku}</span>{' '}
            <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>{chosen.sku}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={cn(evidenceVerbClass(false), 'flex-1')}
              disabled={busy}
              onClick={() => setChosen(null)}
            >
              Choose again
            </button>
            <button
              type="button"
              className={cn(evidenceVerbClass(true), 'flex-1')}
              disabled={busy}
              onClick={confirm}
              data-testid="sku-exception-pair-confirm"
            >
              {busy ? 'Pairing…' : 'Pair'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-role-caption text-mode-muted">
          Pairing moves the stock, photos and description onto the real SKU and closes this exception.
        </p>
      )}
    </EvidenceSection>
  );
}
