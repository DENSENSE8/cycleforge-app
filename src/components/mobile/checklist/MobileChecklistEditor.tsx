'use client';

/**
 * Kit + QC authoring for a resolved catalog product. Fed by an order line
 * (primary) or a deep-link itemNumber/skuId — never the blank landing.
 */

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Loader2, Package } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { useAuth } from '@/contexts/AuthContext';
import { useSkuKitParts } from '@/hooks/useSkuKitParts';
import { useSkuQcChecks } from '@/hooks/useSkuQcChecks';
import {
  useResolveCatalogByItemNumber,
  type CatalogByItemNumberCandidate,
} from '@/hooks/useResolveCatalogByItemNumber';
import { MobileKitPartsCrud } from '@/components/mobile/checklist/MobileKitPartsCrud';
import { MobileQcChecksCrud } from '@/components/mobile/checklist/MobileQcChecksCrud';

type EditorTab = 'kit' | 'qc';

const PAIR_PLATFORMS = [
  { id: 'amazon', label: 'Amazon' },
  { id: 'ebay', label: 'eBay' },
  { id: 'walmart', label: 'Walmart' },
  { id: 'ecwid', label: 'Ecwid' },
  { id: 'shipstation', label: 'ShipStation' },
] as const;

export interface ChecklistEditorContext {
  /** Marketplace item # from the order line (may be empty). */
  itemNumber: string | null;
  /** Explicit catalog id when already known on the order. */
  catalogId: number | null;
  productTitle: string | null;
  orderLabel: string | null;
  sku: string | null;
}

interface MobileChecklistEditorProps {
  context: ChecklistEditorContext;
  onBack: () => void;
  /** Called when catalog id is chosen/paired so the parent can update the URL. */
  onCatalogResolved?: (catalogId: number) => void;
}

export function MobileChecklistEditor({
  context,
  onBack,
  onCatalogResolved,
}: MobileChecklistEditorProps) {
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');
  const queryClient = useQueryClient();

  const itemNumber = (context.itemNumber || '').trim();
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(context.catalogId);
  const [tab, setTab] = useState<EditorTab>('kit');
  const [pairQuery, setPairQuery] = useState(context.productTitle || itemNumber || '');
  const [pairResults, setPairResults] = useState<
    Array<{ id: number; sku: string; product_title: string; image_url?: string | null }>
  >([]);
  const [pairPlatform, setPairPlatform] = useState<string>('amazon');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [searchingPair, setSearchingPair] = useState(false);

  useEffect(() => {
    setSelectedCatalogId(context.catalogId);
  }, [context.catalogId, context.itemNumber, context.sku]);

  const resolveQuery = useResolveCatalogByItemNumber({
    itemNumber: selectedCatalogId == null ? itemNumber || context.sku || null : itemNumber || null,
    catalogId: selectedCatalogId,
    enabled: selectedCatalogId != null || Boolean(itemNumber || context.sku),
  });

  const resolvedCatalogId =
    selectedCatalogId ??
    (resolveQuery.data?.success && resolveQuery.data.status === 'resolved'
      ? resolveQuery.data.catalog.catalogId
      : null);

  const kit = useSkuKitParts(resolvedCatalogId);
  const qc = useSkuQcChecks(resolvedCatalogId);

  const pickCandidate = (c: CatalogByItemNumberCandidate) => {
    setSelectedCatalogId(c.catalogId);
    onCatalogResolved?.(c.catalogId);
  };

  const refreshLists = useCallback(() => {
    if (resolvedCatalogId == null) return;
    void queryClient.invalidateQueries({ queryKey: ['sku-kit-parts', resolvedCatalogId] });
    void queryClient.invalidateQueries({ queryKey: ['sku-qc-checks', resolvedCatalogId] });
    void queryClient.invalidateQueries({ queryKey: ['sku-catalog-by-item-number'] });
  }, [queryClient, resolvedCatalogId]);

  const searchForPair = async () => {
    const q = pairQuery.trim();
    if (!q) return;
    setSearchingPair(true);
    setPairError(null);
    try {
      const attempts = [
        `/api/sku-catalog/search?q=${encodeURIComponent(q)}&searchField=title&limit=12`,
        `/api/sku-catalog/search?q=${encodeURIComponent(q)}&limit=12`,
      ];
      let items: Array<{
        id: number;
        sku: string;
        product_title: string;
        image_url?: string | null;
      }> = [];
      for (const url of attempts) {
        const res = await fetch(url, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'Search failed');
        }
        items = Array.isArray(json.items) ? json.items : [];
        if (items.length > 0) break;
      }
      setPairResults(
        items.map((row) => ({
          id: row.id,
          sku: row.sku,
          product_title: row.product_title,
          image_url: row.image_url,
        })),
      );
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Search failed');
      setPairResults([]);
    } finally {
      setSearchingPair(false);
    }
  };

  const pairToCatalog = async (skuCatalogId: number) => {
    if (!canManage || !itemNumber) return;
    setPairing(true);
    setPairError(null);
    try {
      const res = await fetch('/api/sku-catalog/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuCatalogId,
          itemNumber,
          platform: pairPlatform,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || `Pair failed (${res.status})`);
      }
      setSelectedCatalogId(skuCatalogId);
      onCatalogResolved?.(skuCatalogId);
      void queryClient.invalidateQueries({ queryKey: ['sku-catalog-by-item-number'] });
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Pair failed');
    } finally {
      setPairing(false);
    }
  };

  const catalogHeader =
    kit.data?.catalog ??
    (resolveQuery.data?.success && resolveQuery.data.status === 'resolved'
      ? {
          id: resolveQuery.data.catalog.catalogId,
          sku: resolveQuery.data.catalog.sku,
          product_title: resolveQuery.data.catalog.productTitle,
          image_url: resolveQuery.data.catalog.imageUrl,
          category: resolveQuery.data.catalog.category,
        }
      : null);

  const showUnresolved =
    Boolean(itemNumber || context.sku) &&
    resolveQuery.isSuccess &&
    resolveQuery.data?.success &&
    resolveQuery.data.status === 'unresolved' &&
    selectedCatalogId == null;

  const showAmbiguous =
    resolveQuery.isSuccess &&
    resolveQuery.data?.success &&
    resolveQuery.data.status === 'ambiguous' &&
    selectedCatalogId == null;

  const noIdentity = !itemNumber && !context.sku && selectedCatalogId == null;

  return (
    <div className={`flex h-full flex-col ${TOKENS.colors.background}`}>
      <div className="flex shrink-0 items-start gap-2 border-b border-border-hairline bg-surface-card px-3 py-3">
        <IconButton
          icon={<ChevronLeft className="h-5 w-5" />}
          ariaLabel="Back to order list"
          onClick={onBack}
          className="mt-0.5 h-10 w-10 shrink-0 rounded-full border border-border-soft"
        />
        <div className="min-w-0 flex-1">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Checklist</p>
          <p className="mt-0.5 truncate text-role-body font-semibold text-text-default">
            {context.productTitle || itemNumber || context.sku || 'Order'}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-role-micro text-text-faint">
            {context.orderLabel ? (
              <span>
                Order <span className="font-mono">{context.orderLabel}</span>
              </span>
            ) : null}
            {itemNumber ? (
              <span>
                Item # <span className="font-mono">{itemNumber}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {noIdentity && (
          <p className="rounded-none bg-amber-50 px-3 py-3 text-role-caption font-semibold text-amber-900">
            This order has no item number or SKU to resolve a product checklist.
          </p>
        )}

        {resolveQuery.isFetching && (
          <div className="flex items-center justify-center gap-2 py-12 text-text-soft">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-role-caption font-semibold">Resolving product…</span>
          </div>
        )}

        {resolveQuery.isError && (
          <p className="rounded-none bg-rose-50 px-3 py-3 text-role-caption font-semibold text-rose-700">
            {(resolveQuery.error as Error)?.message || 'Lookup failed'}
          </p>
        )}

        {showAmbiguous && resolveQuery.data?.success && resolveQuery.data.status === 'ambiguous' && (
          <div className="space-y-3">
            <p className="text-role-caption font-semibold text-text-muted">
              Multiple products match this item. Pick one:
            </p>
            <ul className="space-y-2">
              {resolveQuery.data.candidates.map((c) => (
                <li key={c.catalogId}>
                  <button
                    type="button"
                    onClick={() => pickCandidate(c)}
                    className="flex w-full items-center gap-3 rounded-none bg-surface-canvas px-3 py-3 text-left active:bg-surface-sunken"
                  >
                    <CandidateThumb imageUrl={c.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-role-body font-semibold text-text-default">
                        {c.productTitle}
                      </p>
                      <p className="font-mono text-role-micro text-text-soft">{c.sku}</p>
                      <p className="mt-0.5 text-role-micro text-text-faint">
                        {c.kitPartCount} kit · {c.qcCheckCount} QC
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showUnresolved && (
          <div className="space-y-4">
            <div className="rounded-none border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-role-caption font-semibold text-amber-900">
                No catalog product linked
                {itemNumber ? (
                  <>
                    {' '}
                    to <span className="font-mono">{itemNumber}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-1 text-role-micro font-medium text-amber-800/80">
                Search for the product and pair this item number
                {canManage ? '.' : ' (requires catalog manage).'}
              </p>
            </div>

            {canManage && itemNumber && (
              <div className="space-y-2">
                <label className="block text-role-eyebrow uppercase tracking-widest text-text-soft">
                  Platform
                </label>
                <select
                  value={pairPlatform}
                  onChange={(e) => setPairPlatform(e.target.value)}
                  className="w-full rounded-none border border-border-soft bg-surface-card px-3 py-2.5 text-role-caption font-semibold text-text-default"
                >
                  {PAIR_PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pairQuery}
                    onChange={(e) => setPairQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void searchForPair();
                    }}
                    placeholder="Search catalog title / SKU"
                    className="min-w-0 flex-1 rounded-none border border-border-soft bg-surface-card px-3 py-2.5 text-role-caption font-semibold text-text-default placeholder:text-text-faint"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={searchingPair}
                    onClick={() => void searchForPair()}
                    disabled={!pairQuery.trim()}
                  >
                    Search
                  </Button>
                </div>
                {pairError && (
                  <p className="text-role-caption font-semibold text-red-600">{pairError}</p>
                )}
                <ul className="space-y-2">
                  {pairResults.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        disabled={pairing}
                        onClick={() => void pairToCatalog(row.id)}
                        className="flex w-full items-center gap-3 rounded-none bg-surface-canvas px-3 py-3 text-left active:bg-surface-sunken disabled:opacity-60"
                      >
                        <CandidateThumb imageUrl={row.image_url ?? null} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-role-body font-semibold text-text-default">
                            {row.product_title || row.sku}
                          </p>
                          <p className="font-mono text-role-micro text-text-soft">{row.sku}</p>
                        </div>
                        <span className="shrink-0 text-role-micro font-semibold uppercase tracking-wider text-text-muted">
                          {pairing ? '…' : 'Pair'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {resolvedCatalogId != null && catalogHeader && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-none bg-surface-canvas px-3 py-3">
              <CandidateThumb imageUrl={catalogHeader.image_url ?? null} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-role-body font-semibold text-text-default">
                  {catalogHeader.product_title || catalogHeader.sku}
                </p>
                <p className="font-mono text-role-micro text-text-soft">{catalogHeader.sku}</p>
              </div>
            </div>

            <div className="flex gap-1 rounded-none bg-surface-sunken p-1">
              <TabButton
                active={tab === 'kit'}
                label={`Kit (${kit.data?.parts.length ?? 0})`}
                onClick={() => setTab('kit')}
              />
              <TabButton
                active={tab === 'qc'}
                label={`QC (${qc.data?.checks.length ?? 0})`}
                onClick={() => setTab('qc')}
              />
            </div>

            {(kit.isLoading || qc.isLoading) && (
              <div className="flex items-center justify-center gap-2 py-8 text-text-soft">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-role-caption font-semibold">Loading checklist…</span>
              </div>
            )}

            {tab === 'kit' && kit.data && (
              <MobileKitPartsCrud
                catalogId={resolvedCatalogId}
                kitParts={kit.data.parts}
                canManage={canManage}
                onRefresh={refreshLists}
              />
            )}
            {tab === 'qc' && qc.data && (
              <MobileQcChecksCrud
                catalogId={resolvedCatalogId}
                qcChecks={qc.data.checks}
                canManage={canManage}
                onRefresh={refreshLists}
              />
            )}

            {(kit.isError || qc.isError) && (
              <p className="text-role-caption font-semibold text-red-600">
                Couldn&apos;t load checklist rows for this product.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-none px-3 py-2.5 text-role-caption font-semibold transition-colors ${
        active
          ? 'bg-surface-card text-text-default shadow-sm'
          : 'text-text-soft active:bg-surface-card/60'
      }`}
    >
      {label}
    </button>
  );
}

function CandidateThumb({ imageUrl }: { imageUrl: string | null }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none bg-surface-sunken ring-1 ring-border-soft">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <Package className="h-5 w-5 text-text-faint" />
      )}
    </span>
  );
}
