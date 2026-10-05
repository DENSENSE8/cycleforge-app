'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives';
import { ProductThumb } from '@/features/prepack/prepack-ui';
import type { PrepackCatalogChoice } from '@/lib/prepack/types';

/**
 * Desk prepack, left pane: catalog products. Sidebar Find (`?q=`) searches the
 * catalog (SKU, UPC/EAN/GTIN, MPN, title); an empty Find lists the products
 * prepacked or received most recently. Clicking one loads it into the form.
 */
export function PrepackProductsColumn({
  activeCatalogId,
  onChoose,
}: {
  activeCatalogId: number | null;
  onChoose: (product: PrepackCatalogChoice) => void;
}) {
  const query = useSearchParams().get('q')?.trim() ?? '';
  const [items, setItems] = useState<PrepackCatalogChoice[]>([]);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Find already debounces the URL write, so each `q` is fetched as it lands.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/prepack/catalog${query ? `?q=${encodeURIComponent(query)}` : ''}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { items?: PrepackCatalogChoice[]; error?: string } | null;
        if (!response.ok || !body?.items) throw new Error(body?.error || `Catalog search failed (${response.status})`);
        setItems(body.items);
        setError(null);
        setLoadedQuery(query);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Catalog search failed');
        setLoadedQuery(query);
      });
    return () => controller.abort();
  }, [query]);

  const loading = loadedQuery !== query;
  return (
    <aside
      className="hidden min-h-0 min-w-0 overflow-y-auto border-r border-mode-rule bg-surface-card xl:block"
      aria-label="Products"
      data-testid="prepack-products-column"
      data-query={loadedQuery ?? ''}
    >
      <div className="sticky top-0 z-10 border-b border-mode-rule bg-surface-card px-4 py-3">
        <h2 className="text-role-data font-semibold text-mode-ink">Products</h2>
        <p className="text-role-caption text-text-muted">
          {query ? `Catalog matches for “${query}”` : 'Prepacked or received recently — Find (F) searches the catalog'}
        </p>
      </div>
      {error ? <p role="alert" className="px-4 py-3 text-role-caption font-semibold text-text-danger">{error}</p> : null}
      <ul className={`divide-y divide-mode-rule ${loading ? 'opacity-60' : ''}`}>
        {items.map((item) => (
          <li key={item.id}>
            <Button
              variant={item.id === activeCatalogId ? 'primarySoft' : 'ghost'}
              size="lg"
              radius="flush"
              className="h-auto min-h-14 w-full items-center justify-start gap-3 whitespace-normal px-4 py-3 text-left"
              aria-pressed={item.id === activeCatalogId}
              onClick={() => onChoose(item)}
              data-testid="prepack-product-row"
              data-catalog-id={item.id}
            >
              <ProductThumb src={item.imageUrl} title={item.title} />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="line-clamp-2 text-sm font-semibold text-mode-ink">{item.title}</span>
                <span className="break-all font-mono text-role-caption text-text-muted">
                  {item.sku}
                  {item.mpn ? ` · MPN ${item.mpn}` : ''}
                </span>
              </span>
            </Button>
          </li>
        ))}
        {!loading && !error && items.length === 0 ? (
          <li className="px-4 py-3 text-role-caption text-text-muted">
            {query ? 'No catalog product matches. Clear Find to see recent products.' : 'No products prepacked or received yet.'}
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
