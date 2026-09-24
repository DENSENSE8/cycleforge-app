'use client';

/**
 * `/m/on-hold/[sku]/pair` — pair one SKU exception to its real Zoho SKU.
 *
 * Two halves on one screen, because they answer one question:
 *
 *   WHAT is this?     — the placeholder's own facts, pinned under the header.
 *                       The name and barcode were typed in a hurry by someone
 *                       holding the box, and the person deciding the pairing
 *                       needs exactly what they saw, not a summary of it.
 *
 *   WHAT does it become? — a catalog search, each hit carrying a Pair action.
 *                       The list is seeded with the Zoho mirror's best matches
 *                       for the typed name, because usually the real SKU exists
 *                       and the placeholder exists only because the scan
 *                       happened before the catalog row did.
 *
 * ## Confirm states a number, not a vibe
 * The commit bar says what will be true afterwards — "N units become X" —
 * because the irreversible part of this action is a count moving between
 * products. The endpoint enforces the rules (real target only, no TMP→TMP)
 * and carries photos + description onto the real SKU; this screen's job is to
 * make the operator sure before the request exists.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { Panel } from '@/design-system/primitives';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { STATION_EYEBROW_CLASS } from '@/components/mobile/station/station-chrome';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import {
  invalidateSkuExceptions,
  useProvisionalSku,
  useSkuExceptionsRealtime,
} from '@/hooks/useProvisionalSkus';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { mobileSkuExceptionHref } from '@/lib/inventory/sku-exception-links';
import { toast } from '@/lib/toast';
import { MobileTriagePage, type TriageSection } from '@/components/mobile/triage/MobileTriagePage';
import { TriageRow } from '@/components/mobile/triage/TriageRow';
import { OnHoldBadge } from '@/components/mobile/pair/OnHoldBadge';
import { cn } from '@/utils/_cn';

export function MobileOnHoldMerge({ sku }: { sku: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<SkuCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useSkuExceptionsRealtime();
  const { data: provisional, mergedInto } = useProvisionalSku(sku);

  // Seed the search with the typed name: the likeliest real SKU is whatever
  // the catalog already calls the thing the operator described.
  const effectiveQuery = query || (provisional?.productTitle ?? '');

  const { data: hits = [], isFetching } = useSkuCatalogSearch(effectiveQuery, {
    limit: 24,
    searchField: 'zoho_catalog',
  });

  const sections: TriageSection[] = useMemo(() => {
    // A placeholder cannot pair to itself, and TMP→TMP is refused by the
    // endpoint — hiding those here is honesty, not decoration.
    const real = hits.filter((hit) => hit.sku !== sku && !isProvisionalSku(hit.sku));
    return [
      {
        heading: 'Zoho catalog matches',
        count: real.length,
        empty: isFetching ? 'Searching…' : `No catalog match for “${effectiveQuery}”`,
        rows: real.map((hit) => (
          <TriageRow
            key={`${hit.id}-${hit.sku}`}
            title={hit.product_title || hit.sku}
            meta={
              <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
                {hit.sku}
              </span>
            }
            imageUrl={hit.image_url}
            actionLabel={chosen?.sku === hit.sku ? 'Chosen' : 'Pair'}
            actionName={`Pair ${provisional?.productTitle ?? sku} to ${hit.product_title || hit.sku}`}
            inspectName={`Choose ${hit.product_title || hit.sku}`}
            onInspect={() => setChosen(hit)}
            onAction={() => setChosen(hit)}
            busy={chosen?.sku === hit.sku && busy}
          />
        )),
      },
    ];
  }, [busy, chosen, effectiveQuery, hits, isFetching, provisional?.productTitle, sku]);

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
        throw new Error(data?.error || `Pairing failed (${res.status})`);
      }
      await invalidateSkuExceptions(queryClient);
      toast.success(`${sku} paired to ${chosen.sku}`);
      router.replace('/m/on-hold');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing failed');
      setBusy(false);
    }
  }, [busy, chosen, queryClient, router, sku]);

  if (mergedInto) {
    return (
      <div className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
        <MobileDetailTopBar title="Pair to Zoho SKU" subtitle={sku} backHref="/m/on-hold" />
        <p className="px-4 py-6 text-role-caption text-text-soft">
          Already paired to <span className="font-mono text-text-default">{mergedInto}</span>.
        </p>
      </div>
    );
  }

  const totalUnits = provisional?.stock ?? 0;
  const binCount = provisional?.locations.length ?? 0;

  // The placeholder's own facts lead the list: the pairing decision is made
  // against the creator's evidence, not a lossy preview of it.
  const facts: TriageSection = {
    count: 1,
    rows: (
      <Panel radius="none" padding="none" className="space-y-1 border-b border-border-hairline px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text-default">
            {provisional?.productTitle ?? '…'}
          </p>
          <OnHoldBadge />
        </div>
        {provisional?.barcode ? (
          <p className="font-mono text-role-caption text-text-soft">Barcode {provisional.barcode}</p>
        ) : null}
        <p className={cn('text-role-caption text-text-default tabular-nums', STATION_EYEBROW_CLASS)}>
          {totalUnits} unit{totalUnits === 1 ? '' : 's'}
          {binCount > 0 ? ` · ${binCount} location${binCount === 1 ? '' : 's'}` : ''}
        </p>
      </Panel>
    ),
  };

  return (
    <div className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
      <MobileTriagePage
        title="Pair to Zoho SKU"
        subtitle={sku}
        backHref={mobileSkuExceptionHref(sku)}
        query={query}
        onQueryChange={setQuery}
        searchLabel="Search the Zoho catalog"
        isSearching={isFetching}
        sections={[facts, ...sections]}
      />

      {chosen && (
        <footer className="sticky bottom-0 border-t border-border-soft bg-surface-card px-4 py-3">
          {error && (
            <p role="alert" className="mb-2 text-role-caption text-text-danger">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            radius="flush"
            className="w-full"
            loading={busy}
            icon={<Check />}
            onClick={() => void confirm()}
          >
            {busy
              ? 'Pairing…'
              : `${totalUnits} unit${totalUnits === 1 ? '' : 's'} become ${chosen.product_title || chosen.sku}`}
          </Button>
          {!busy && (
            <Button
              variant="secondary"
              size="md"
              radius="flush"
              className="mt-2 w-full"
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
