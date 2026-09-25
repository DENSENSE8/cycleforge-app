'use client';

/**
 * `/m/pair/[code]` — decide what belongs in an empty location.
 *
 * ## Why this left the bottom sheet
 *
 * Pairing used to happen inside the scan station's capture slot: a search
 * field and a results list sharing 42svh with the OS keyboard, on a surface
 * whose actual job is a control strip. It worked, and it was the wrong
 * furniture — pairing is a multi-step JOB (search, inspect, decide, count),
 * and `SURFACE_LAW` §5 gives a job its own screen.
 *
 * Leaving `/m/scan` for it is a deliberate exception to the rule in
 * `identify-land.ts` that location scans settle on the kernel. That rule
 * prevents a SCAN from navigating away mid-loop; it does not govern an
 * operator tapping a button. Scanning still settles. Only a tap pushes, and
 * Back resumes the loop with the scanner re-armed.
 *
 * ## The idle list is the feature
 *
 * Empty state used to say "type a SKU or product title". A person filling a
 * bay is pairing the same few products across a run of bins, so the products
 * already stocked in THIS ROOM are the likeliest answer — offered as one-tap
 * rows, with the keyboard never opening. Search is the fallback, not the path.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/design-system/primitives/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { MobileTriagePage, type TriageSection } from '@/components/mobile/triage/MobileTriagePage';
import { TriageRow } from '@/components/mobile/triage/TriageRow';
import { ProvisionalCreateSheet } from '@/components/mobile/scan/ProvisionalCreateSheet';
import { PairDetailSheet } from './PairDetailSheet';
import { OnHoldBadge } from './OnHoldBadge';
import type { PairCandidate } from '@/lib/neon/pair-candidates-queries';
import { motion } from '@/design-system/motion';

const MotionButton = motion.create(Button);

function faceFor(code: string): string {
  const segs = parseLocationCodeFlat(code);
  return segs ? locationCode(segs) : code;
}

export function MobilePairLocation({ code }: { code: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const [query, setQuery] = useState('');
  const [inspecting, setInspecting] = useState<{ sku: string; title: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const face = useMemo(() => faceFor(code), [code]);

  /**
   * The products already stocked in this location's ROOM — the idle list.
   *
   * The response also carries the room's NAME. It is deliberately NOT painted:
   * an eyebrow over the title said where the operator already knows they are
   * standing, and it cost a line of chrome on the screen with the least room
   * for one (operator 2026-09-15: *"the room name isn't even needed above pair
   * location, just pair location"*). The section heading below already frames
   * the list as "already in this room".
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
      router.replace(`/m/pair/${encodeURIComponent(code)}/${encodeURIComponent(sku)}`);
    },
    [code, router],
  );

  const sections: TriageSection[] = useMemo(() => {
    if (query.trim()) {
      return [
        {
          heading: 'Catalog matches',
          count: hits.length,
          empty: isFetching ? 'Searching…' : `No catalog match for “${query.trim()}”`,
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
        heading: 'Already in this room',
        count: candidates.length,
        empty: 'Nothing stocked nearby yet — search for a product above.',
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
              code={
                candidate.isProvisional || isProvisionalSku(candidate.sku) ? <OnHoldBadge /> : null
              }
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

  if (creating) {
    return (
      <MobileTriagePage
        title="On-hold product"
        backHref={`/m/pair/${encodeURIComponent(code)}`}
        query=""
        onQueryChange={() => {}}
        searchLabel="Search"
        sections={[]}
        footer={
          <ProvisionalCreateSheet
            seed={query}
            staffId={staffId}
            onCancel={() => setCreating(false)}
            onCreated={(item) => {
              setCreating(false);
              pair(item.sku);
            }}
          />
        }
      />
    );
  }

  return (
    <>
      <MobileTriagePage
        title="Pair location"
        backHref="/m/scan"
        query={query}
        onQueryChange={setQuery}
        searchLabel="Search SKU or product title"
        isSearching={isFetching}
        sections={sections}
        footer={
          query.trim() && !isFetching && hits.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <MotionButton
                variant="secondary"
                size="lg"
                radius="flush"
                className="w-full"
                onClick={() => setCreating(true)}
                whileTap={{ scale: 0.96 }}
              >
                Create on-hold product
              </MotionButton>
              <span className="text-role-micro text-text-faint">
                Counts stock now · not sellable until merged into a real SKU
              </span>
            </div>
          ) : null
        }
      />

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
