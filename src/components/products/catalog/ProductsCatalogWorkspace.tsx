'use client';

/**
 * Products Catalog workbench — hub-primary MDM browser.
 * List = sku_catalog golden records; Inventory chip when provider_item_id set;
 * expand shows linked sku_platform_ids + FBA FNSKUs.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw } from '@/components/Icons';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { ToolbarSearchToggle } from '@/design-system/primitives/ToolbarSearchToggle';
import { Button } from '@/design-system/primitives';
import { InventoryMasterChip } from '@/components/products/InventoryMasterChip';
import { platformStyle } from '@/components/products/pairing/platform-style';
import type { CatalogLinkFilter, CatalogListRow } from '@/components/products/catalog/types';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';

type LinkSegment = CatalogLinkFilter;

const SEGMENTS: Array<{ id: LinkSegment; label: string; color: 'blue' | 'yellow' | 'gray' }> = [
  { id: 'active_linked', label: 'Active & Linked', color: 'blue' },
  { id: 'unlinked_pending', label: 'Unlinked / Pending', color: 'yellow' },
  { id: 'all', label: 'All', color: 'gray' },
];

function parseLinkFilter(raw: string | null): LinkSegment {
  if (raw === 'unlinked_pending' || raw === 'all') return raw;
  return 'active_linked';
}

interface InventoryProviderMeta {
  key: string;
  label: string;
}

interface LinkedPayload {
  platformIds: Array<{
    id: number;
    platform: string;
    platform_sku: string | null;
    platform_item_id: string | null;
    display_name: string | null;
    listing_title: string | null;
    listing_url: string | null;
    confidence: number | null;
  }>;
  fnskus: Array<{
    fnsku: string;
    asin: string | null;
    sku: string | null;
    product_title: string | null;
    condition: string | null;
  }>;
}

export function ProductsCatalogWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const linkFilter = parseLinkFilter(searchParams.get('linkFilter'));

  const [searchInput, setSearchInput] = useState(q);
  const [items, setItems] = useState<CatalogListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<InventoryProviderMeta | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [linkedById, setLinkedById] = useState<Record<number, LinkedPayload | 'loading' | 'error'>>({});
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val === null) params.delete(key);
        else params.set(key, val);
      }
      // Keep view=catalog sticky.
      params.set('view', 'catalog');
      const qs = params.toString();
      router.replace(`/products?${qs}`);
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        linkFilter,
        limit: '100',
        offset: '0',
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/sku-catalog?${params}`, { credentials: 'same-origin' });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setItems(body.items ?? []);
      setTotal(body.total ?? 0);
      setProvider(body.inventoryProvider ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [linkFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const expandRow = useCallback(async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (linkedById[id] && linkedById[id] !== 'error') return;
    setLinkedById((prev) => ({ ...prev, [id]: 'loading' }));
    try {
      const res = await fetch(`/api/sku-catalog/${id}`, { credentials: 'same-origin' });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || `HTTP ${res.status}`);
      setLinkedById((prev) => ({
        ...prev,
        [id]: {
          platformIds: body.platformIds ?? [],
          fnskus: body.fnskus ?? [],
        },
      }));
    } catch {
      setLinkedById((prev) => ({ ...prev, [id]: 'error' }));
    }
  }, [expandedId, linkedById]);

  const refreshInventory = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/zoho/items/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'incremental' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Sync failed (${res.status})`);
      }
      toast.success('Inventory catalog refresh started');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Inventory refresh failed');
    } finally {
      setSyncing(false);
    }
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkbenchChromeHeader
        tabs={SEGMENTS.map((s) => ({
          id: s.id,
          label: s.label,
          color: s.color,
        }))}
        activeTab={linkFilter}
        onTabChange={(id) =>
          updateParams({
            linkFilter: id === 'active_linked' ? null : id,
          })
        }
        solidTone="accent"
        search={
          <ToolbarSearchToggle
            value={searchInput}
            onChange={(value) => {
              setSearchInput(value);
              updateParams({ q: value.trim() || null });
            }}
            onClear={() => {
              setSearchInput('');
              updateParams({ q: null });
            }}
            placeholder="Search SKU, title, inventory id…"
            tone="blue"
          />
        }
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={syncing}
            onClick={() => void refreshInventory()}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            Refresh inventory
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-faint">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading catalog…
          </div>
        ) : error ? (
          <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-text-faint">
            {linkFilter === 'active_linked'
              ? 'No active inventory-linked products yet. Try Unlinked / Pending or refresh inventory.'
              : 'No products match this filter.'}
          </div>
        ) : (
          <div className="border-t border-border-hairline">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-hairline bg-surface-card px-3 py-1.5 text-role-micro font-medium uppercase tracking-wide text-text-soft">
              <span>
                {total.toLocaleString()} product{total === 1 ? '' : 's'}
              </span>
              {provider ? (
                <span className="normal-case tracking-normal text-text-faint">
                  Inventory provider: {provider.label}
                </span>
              ) : null}
            </div>
            <ul className="divide-y divide-border-hairline">
              {items.map((row) => {
                const open = expandedId === row.id;
                const linked = linkedById[row.id];
                const title = row.display_title || row.product_title || row.sku;
                return (
                  <li key={row.id} className="bg-surface-card">
                    <button
                      type="button"
                      onClick={() => void expandRow(row.id)}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-sunken/60"
                    >
                      <span className="mt-1 shrink-0 text-text-faint">
                        {open ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border-soft bg-surface-canvas">
                        {row.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.image_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-role-micro text-text-faint">
                            —
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-text-default">
                            {title}
                          </span>
                          {row.is_inventory_linked ? (
                            <InventoryMasterChip
                              providerItemId={row.provider_item_id}
                              providerLabel={provider?.label}
                            />
                          ) : null}
                          {row.has_pending_action ? (
                            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-role-eyebrow font-semibold uppercase tracking-wider text-amber-800">
                              Pending
                            </span>
                          ) : null}
                          {!row.is_active ? (
                            <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-eyebrow font-medium uppercase tracking-wide text-text-soft">
                              Inactive
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-role-caption text-text-soft">
                          <span className="font-mono text-text-muted">{row.sku}</span>
                          {row.category ? <span>{row.category}</span> : null}
                          <span>{row.platform_count} channel{row.platform_count === 1 ? '' : 's'}</span>
                          <span>{row.manual_count} manual{row.manual_count === 1 ? '' : 's'}</span>
                          <span>{row.qc_step_count} QC</span>
                          <span>{row.order_count} orders</span>
                        </div>
                      </div>
                      <Link
                        href={`/products/${encodeURIComponent(row.sku)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 inline-flex shrink-0 items-center gap-1 text-role-caption text-blue-600 hover:text-blue-800"
                      >
                        Open
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </button>

                    {open ? (
                      <div className="border-t border-border-hairline bg-surface-sunken/40 px-3 py-2 pl-10">
                        {linked === 'loading' || linked === undefined ? (
                          <div className="flex items-center gap-2 py-2 text-role-caption text-text-faint">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading linked products…
                          </div>
                        ) : linked === 'error' ? (
                          <div className="py-2 text-role-caption text-red-600">
                            Failed to load linked products.
                          </div>
                        ) : (
                          <LinkedProductsList
                            linked={linked}
                            providerItemId={row.provider_item_id}
                            providerLabel={provider?.label}
                          />
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function LinkedProductsList({
  linked,
  providerItemId,
  providerLabel,
}: {
  linked: LinkedPayload;
  providerItemId: string | null;
  providerLabel: string | null | undefined;
}) {
  const channels = linked.platformIds;
  const fnskus = linked.fnskus;

  if (!providerItemId && channels.length === 0 && fnskus.length === 0) {
    return (
      <div className="py-2 text-role-caption text-text-faint">
        No inventory link or channel products yet. Pair channels from the Pairing view.
      </div>
    );
  }

  return (
    <div className="space-y-3 py-1">
      {providerItemId ? (
        <div className="text-role-caption text-text-muted">
          <span className="font-medium text-text-soft">Inventory master · </span>
          {providerLabel ? `${providerLabel} · ` : null}
          <span className="font-mono">{providerItemId}</span>
        </div>
      ) : (
        <div className="text-role-caption text-amber-800">
          Not linked to inventory — appears under Unlinked / Pending until provider_item_id is stamped.
        </div>
      )}

      {channels.length > 0 ? (
        <ul className="divide-y divide-border-hairline rounded-md border border-border-soft bg-surface-card">
          {channels.map((p) => {
            const style = platformStyle(p.platform);
            const label = p.listing_title || p.display_name || p.platform_sku || p.platform_item_id || '—';
            return (
              <li key={p.id} className={cn('flex flex-wrap items-baseline justify-between gap-2 px-2.5 py-1.5 border-l-2', style.ring)}>
                <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                  <span className={cn('rounded border px-1.5 py-0.5 text-role-micro font-medium uppercase tracking-wide', style.chip)}>
                    {style.label}
                  </span>
                  <span className="truncate text-sm text-text-default">{label}</span>
                  <span className="font-mono text-role-caption text-text-soft">
                    {p.platform_sku || p.platform_item_id || ''}
                  </span>
                </div>
                {p.listing_url ? (
                  <a
                    href={p.listing_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-role-caption text-blue-600 hover:text-blue-800"
                  >
                    Listing
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="text-role-caption text-text-faint">No channel products paired yet.</div>
      )}

      {fnskus.length > 0 ? (
        <div>
          <div className="mb-1 text-role-micro font-medium uppercase tracking-wide text-text-soft">
            FBA FNSKU / ASIN
          </div>
          <ul className="divide-y divide-border-hairline rounded-md border border-border-soft bg-surface-card">
            {fnskus.map((f) => {
              const style = platformStyle('fba');
              return (
                <li key={f.fnsku} className={cn('flex flex-wrap items-baseline gap-2 px-2.5 py-1.5 border-l-2', style.ring)}>
                  <span className={cn('rounded border px-1.5 py-0.5 text-role-micro font-medium uppercase tracking-wide', style.chip)}>
                    FBA
                  </span>
                  <span className="font-mono text-role-caption text-text-muted">{f.fnsku}</span>
                  {f.asin ? <span className="font-mono text-role-caption text-text-soft">ASIN {f.asin}</span> : null}
                  {f.product_title ? (
                    <span className="truncate text-sm text-text-default">{f.product_title}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
