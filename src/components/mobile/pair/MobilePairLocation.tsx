'use client';

/** `/m/pair/[code]` — decide what belongs in an empty location. */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from '@/components/Icons';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { MobileTriagePage, type TriageSection } from '@/components/mobile/triage/MobileTriagePage';
import { TriageRow } from '@/components/mobile/triage/TriageRow';
import { ProvisionalCreateSheet } from '@/components/mobile/scan/ProvisionalCreateSheet';
import { DetailDock } from '@/design-system/components/DetailDock';
import { PairDetailSheet } from './PairDetailSheet';
import type { PairCandidate } from '@/lib/neon/pair-candidates-queries';

function faceFor(code: string): string {
  const segs = parseLocationCodeFlat(code);
  return segs ? locationCode(segs) : code;
}

/**
 * `openException` — land with the SKU-exception sheet already up (the
 * location hub's "Not in the catalog" door: `?exception=1`).
 */
export function MobilePairLocation({
  code,
  openException = false,
  verificationToken,
  returnHref,
}: {
  code: string;
  openException?: boolean;
  verificationToken: string | null;
  returnHref?: string | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const [query, setQuery] = useState('');
  const [inspecting, setInspecting] = useState<{ sku: string; title: string } | null>(null);
  const [creating, setCreating] = useState(openException);

  const face = useMemo(() => faceFor(code), [code]);

  /**
   * The products already stocked in this location's ROOM — the idle list.
   * for one (operator 2026-09-15: *"the room name isn't even needed above pair
   * (operator 2026-09-25): rows start right under the search field.
   */
  const { data: candidates = [] } = useQuery<PairCandidate[]>({
    queryKey: ['pair-candidates', code],
    queryFn: async () => {
      const res = await fetch(
        `/api/locations/${encodeURIComponent(code)}/pair-candidates`,
        { credentials: 'include' },
      );
      if (!res.ok) return [];
      const json = (await res.json()) as { candidates?: PairCandidate[] };
      return json.candidates ?? [];
    },
  });

  const { data: hits = [], isFetching } = useSkuCatalogSearch(query, {
    limit: 24,
    searchField: 'zoho_catalog',
  });

  /**
   * Pairing does not write anything here. It hands off to the qty screen,
   * where the operator says HOW MANY — and a pairing with no quantity is not
   * a fact about the warehouse, it is a half-finished sentence.
   */
  const pair = useCallback(
    (sku: string) => {
      const params = new URLSearchParams();
      if (verificationToken) params.set('verified', verificationToken);
      if (returnHref) params.set('return', returnHref);
      router.replace(`/m/pair/${encodeURIComponent(code)}/${encodeURIComponent(sku)}${params.size ? `?${params.toString()}` : ''}`);
    },
    [code, returnHref, router, verificationToken],
  );

  const sections: TriageSection[] = useMemo(() => {
    if (query.trim()) {
      return [
        {
          heading: 'Catalog matches',
          count: hits.length,
          empty: isFetching
            ? 'Searching…'
            : `No catalog match for “${query.trim()}” — not a SKU yet? Tap SKU exception below.`,
          rows: hits.map((hit: SkuCatalogItem) => (
            <TriageRow
              key={`${hit.id}-${hit.sku}`}
              title={hit.product_title || hit.sku}
              meta={
                <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
                  {hit.sku}
                </span>
              }
              imageUrl={hit.image_url}
              actionLabel="Pair"
              actionName={`Pair ${hit.product_title || hit.sku} to ${face}`}
              inspectName={`Details for ${hit.product_title || hit.sku}`}
              onInspect={() => setInspecting({ sku: hit.sku, title: hit.product_title || hit.sku })}
              onAction={() => pair(hit.sku)}
            />
          )),
        },
      ];
    }

    return [
      {
        count: candidates.length,
        empty: 'Nothing stocked nearby yet — search above, or SKU exception below if it is not in the catalog.',
        rows: candidates.map((candidate) => {
          const title = candidate.productTitle || candidate.sku;
          return (
            <TriageRow
              key={candidate.sku}
              title={title}
              meta={
                <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
                  {candidate.sku}
                  {candidate.binCount > 1 ? ` · ${candidate.binCount} bins` : ''}
                </span>
              }
              imageUrl={candidate.imageUrl}
              actionLabel="Pair"
              actionName={`Pair ${title} to ${face}`}
              inspectName={`Details for ${title}`}
              onInspect={() => setInspecting({ sku: candidate.sku, title })}
              onAction={() => pair(candidate.sku)}
            />
          );
        }),
      },
    ];
  }, [candidates, face, hits, isFetching, pair, query]);

  return (
    <>
      <MobileTriagePage
        title="Pair location"
        subtitle={face}
        backHref={returnHref ?? '/m/stock'}
        query={query}
        onQueryChange={setQuery}
        searchLabel="Search SKU or product title"
        isSearching={isFetching}
        sections={sections}
        dock={
          // The way out of the list: the product is real but the catalog has
          // never heard of it (operator 2026-09-25). Always here, not only
          // after a search comes back empty — a torn label never searches.
          <DetailDock
            label="Pair location actions"
            verbs={[{ id: 'exception', label: 'SKU exception — not in catalog', icon: <PackageSearch /> }]}
            onVerb={() => setCreating(true)}
          />
        }
      />

      {creating ? (
        <ProvisionalCreateSheet
          open
          seed={query}
          staffId={staffId}
          locationFace={face}
          onCancel={() => setCreating(false)}
          onCreated={(item) => {
            setCreating(false);
            pair(item.sku);
          }}
        />
      ) : null}

      {inspecting && (
        <PairDetailSheet
          sku={inspecting.sku}
          title={inspecting.title}
          locationFace={face}
          onClose={() => setInspecting(null)}
          onPair={() => {
            const sku = inspecting.sku;
            setInspecting(null);
            pair(sku);
          }}
        />
      )}
    </>
  );
}
