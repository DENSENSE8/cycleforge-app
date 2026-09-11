'use client';

/**
 * Read-only Shopify-like bundle components strip on Products.
 * Edit pairs deep-links to Inventory Graph (sku_relationships SoT).
 * Distinguishes catalog edges from packing kit_parts names.
 *
 * Callers: ProductDetail, KitPartsWorkspace.
 * API: GET /api/sku-catalog/[id]/composition.
 * Schema: sku_relationships + sku_kit_parts (read via composition merge).
 * User: Implement multi-tenant kit / bundle display (Shopify-like).
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { KitComposition } from '@/lib/orders/order-kit-composition';
import { kitCompositionHasComponents, kitCompositionSourceLabel } from '@/lib/orders/order-kit-composition';

type CompositionResponse = {
  success?: boolean;
  composition?: KitComposition;
  source?: 'sku_relationships' | 'sku_kit_parts' | 'none';
};

export type BundleComponentsStripProps = {
  catalogId: number;
  /** Catalog SKU string for Inventory Graph deep-link (`?sku=`). */
  sku: string;
  className?: string;
};

export function BundleComponentsStrip({ catalogId, sku, className }: BundleComponentsStripProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sku-composition', catalogId],
    enabled: Number.isFinite(catalogId) && catalogId > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CompositionResponse> => {
      const res = await fetch(`/api/sku-catalog/${catalogId}/composition`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to load composition');
      return (await res.json()) as CompositionResponse;
    },
  });

  const composition = data?.composition ?? null;
  const source = composition
    ? kitCompositionSourceLabel(composition)
    : (data?.source ?? 'none');
  const hasComponents = composition ? kitCompositionHasComponents(composition) : false;
  const graphHref = `/inventory/graph?sku=${encodeURIComponent(sku)}&view=children`;

  return (
    <section
      className={cn(
        'border border-border-soft bg-surface-card p-4',
        cornerClass('surface'),
        className,
      )}
      data-testid="bundle-components-strip"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-role-caption font-semibold text-text-default">Bundle components</h2>
          <p className="mt-0.5 text-role-micro text-text-muted">
            Catalog parent → child pairs (stockable). Packing checklist names live under Kit Parts.
          </p>
        </div>
        <Link
          href={graphHref}
          className="inline-flex items-center gap-1 text-role-caption font-medium text-text-accent hover:underline"
        >
          Edit pairs
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-role-caption text-text-faint">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading composition…
        </div>
      ) : isError ? (
        <p className="mt-3 text-role-caption text-text-danger">Couldn’t load bundle components.</p>
      ) : !hasComponents ? (
        <p className="mt-3 text-role-caption text-text-faint">
          No catalog children yet. Use Edit pairs to link component SKUs — do not encode kits in the
          SKU string.
        </p>
      ) : (
        <>
          {source === 'sku_kit_parts' ? (
            <p className="mt-3 text-role-micro text-text-muted">
              Names only (packing checklist) — link catalog SKUs for stockable components.
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-border-hairline">
            {composition!.components.map((c) => (
              <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <div className="min-w-0">
                  {c.sku ? (
                    <span className="font-mono text-role-micro text-text-muted">{c.sku}</span>
                  ) : null}
                  <div className="truncate text-role-caption font-medium text-text-default">
                    {c.title}
                  </div>
                </div>
                <span className="shrink-0 text-role-micro tabular-nums text-text-muted">× {c.qty}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
