'use client';

/**
 * `/m/on-hold/[sku]` — reconcile one placeholder into the real SKU.
 *
 * Two halves on one screen, because they answer one question:
 *
 *   WHAT is this?     — the placeholder's own facts, pinned under the header.
 *                       The name and barcode were typed in a hurry by someone
 *                       holding the box, and the person deciding the merge
 *                       needs exactly what they saw, not a summary of it.
 *
 *   WHAT does it become? — a catalog search, each hit carrying a Merge action.
 *                       The list is seeded with the Zoho mirror's best matches
 *                       for the typed name, because usually the real SKU exists
 *                       and the placeholder exists only because the scan
 *                       happened before the catalog row did.
 *
 * ## Confirm states a number, not a vibe
 * The commit bar says what will be true afterwards — "N units become X" —
 * because the irreversible part of this action is a count moving between
 * products, and "Merge Bose into Bose" carries no information about that.
 * The endpoint is what enforces the rules (real target only, no TMP→TMP);
 * this screen's job is to make the operator sure before the request exists.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { Panel } from '@/design-system/primitives';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { STATION_EYEBROW_CLASS } from '@/components/mobile/station/station-chrome';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { MobileTriagePage, type TriageSection } from '@/components/mobile/triage/MobileTriagePage';
import { TriageRow } from '@/components/mobile/triage/TriageRow';
import { OnHoldBadge } from '@/components/mobile/pair/OnHoldBadge';
import type { SkuStockedAt } from '@/lib/neon/pair-candidates-queries';
import { cn } from '@/utils/_cn';
import { useProvisionalSkus } from './use-provisional-skus';

export function MobileOnHoldMerge({ sku }: { sku: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<SkuCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Same cache entry, same shape, as the queue screen — see the hook.
  const { data: provisionalItems } = useProvisionalSkus();
  const provisional = useMemo(
    () => provisionalItems?.find((item) => item.sku === sku) ?? null,
    [provisionalItems, sku],
  );

  const { data: stockedAt = [] } = useQuery<SkuStockedAt[]>({
    queryKey: ['sku-stocked-at', sku],
    queryFn: async () => {
      const res = await fetch(
        `/api/locations/${encodeURIComponent('NONE')}/pair-candidates?sku=${encodeURIComponent(sku)}`,
        { credentials: 'include' },
      );
      if (!res.ok) return [];
      const json = (await res.json()) as { stockedAt?: SkuStockedAt[] };
      return json.stockedAt ?? [];
    },
    enabled: isProvisionalSku(sku),
  });

  // Seed the search with the typed name: the likeliest real SKU is whatever
  // the catalog already calls the thing the operator described.
  const seed = useMemo(() => provisional?.productTitle ?? '', [provisional]);
  const effectiveQuery = query || seed;

  const { data: hits = [], isFetching } = useSkuCatalogSearch(effectiveQuery, {
    limit: 24,
    searchField: 'zoho_catalog',
  });

  const sections: TriageSection[] = useMemo(
    () => [
      {
        heading: 'Catalog matches',
        count: hits.length,
        empty: isFetching ? 'Searching…' : `No catalog match for “${effectiveQuery}”`,
        rows: hits
          // A placeholder cannot merge into itself, and TMP→TMP is refused by
          // the endpoint — hiding it here is honesty, not decoration.
          .filter((hit) => hit.sku !== sku && !isProvisionalSku(hit.sku))
          .map((hit) => (
            <TriageRow
              key={`${hit.id}-${hit.sku}`}
              title={hit.product_title || hit.sku}
              meta={
                <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
                  {hit.sku}
                </span>
              }
              imageUrl={hit.image_url}
              actionLabel={chosen?.sku === hit.sku ? 'Chosen' : 'Merge'}
              actionName={`Merge ${provisional?.productTitle ?? sku} into ${hit.product_title || hit.sku}`}
              inspectName={`Details for ${hit.product_title || hit.sku}`}
              onInspect={() => setChosen(hit)}
              onAction={() => setChosen(hit)}
              busy={chosen?.sku === hit.sku && busy}
            />
          )),
      },
    ],
    [busy, chosen, effectiveQuery, hits, isFetching, provisional?.productTitle, sku],
  );

  const confirm = useCallback(async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sku-catalog/provisional/merge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provisionalSku: sku, targetSku: chosen.sku }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Merge failed (${res.status})`);
      }
      await queryClient.invalidateQueries({ queryKey: ['provisional-skus'] });
      router.replace('/m/on-hold');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
      setBusy(false);
    }
  }, [busy, chosen, queryClient, router, sku]);

  const totalUnits = provisional?.stock ?? 0;

  return (
    <div className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
      <MobileDetailTopBar title="Reconcile" subtitle={sku} mono backHref="/m/on-hold" />

      {/*
        The placeholder's own facts, stated in full. This is the "what is this"
        half — everything the person who created it could see, so the merge
        decision is made against their evidence, not a lossy preview of it.
      */}
      <Panel radius="none" padding="none" className="space-y-1 border-b border-border-hairline px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text-default">
            {provisional?.productTitle ?? '…'}
          </p>
          <OnHoldBadge />
        </div>
        <p className="font-mono text-role-caption text-text-soft">SKU {sku}</p>
        {provisional?.barcode ? (
          <p className="font-mono text-role-caption text-text-soft">
            Barcode {provisional.barcode}
          </p>
        ) : null}
        <p className={cn('text-role-caption text-text-default tabular-nums', STATION_EYEBROW_CLASS)}>
          {totalUnits} unit{totalUnits === 1 ? '' : 's'}
          {stockedAt.length > 0 ? ` · ${stockedAt.length} bin${stockedAt.length === 1 ? '' : 's'}` : ''}
        </p>
      </Panel>

      <div className="flex min-h-0 flex-1 flex-col">
        <MobileTriagePage
          title="Becomes"
          query={query}
          onQueryChange={setQuery}
          searchLabel="Search for the real SKU"
          isSearching={isFetching}
          sections={sections}
        />
      </div>

      {chosen && (
        <footer className="sticky bottom-0 border-t border-border-soft bg-surface-card px-4 py-3">
          {error && (
            <p role="alert" className="mb-2 text-role-caption text-text-danger">
              {error}
            </p>
          )}
          <Button
            variant="execute"
            size="lg"
            radius="flush"
            className="w-full"
            disabled={busy}
            icon={busy ? <Loader2 className="animate-spin" /> : <Check />}
            onClick={() => void confirm()}
          >
            {busy
              ? 'Merging…'
              : `${totalUnits} unit${totalUnits === 1 ? '' : 's'} become ${chosen.product_title || chosen.sku}`}
          </Button>
          {!busy && (
            <Button
              variant="ghost"
              size="md"
              radius="flush"
              className="mt-1 w-full"
              onClick={() => setChosen(null)}
            >
              Choose differently
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}
