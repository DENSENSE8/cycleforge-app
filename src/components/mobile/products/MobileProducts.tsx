'use client';

/** `/m/products` — phone-first catalog lookup for pack standards and parcel facts. */

import { useCallback, useState } from 'react';
import { Package } from '@/components/Icons';
import { SearchField } from '@/design-system/primitives/SearchField';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { MobileDataListRow } from '@/design-system/components/MobileDataListRow';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';

export function MobileProducts() {
  const [query, setQuery] = useState('');
  const catalog = useSkuCatalogSearch(query, {
    limit: 50,
    allowEmpty: true,
    searchField: 'catalog',
  });

  const onQuery = useCallback((next: string) => setQuery(next), []);
  const rows = catalog.data ?? [];

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="mobile-products">
      <div className="sticky top-0 z-base border-b border-mode-rule bg-mode-panel px-mode-page py-2">
        <SearchField
          value={query}
          onChange={onQuery}
          onClear={() => setQuery('')}
          placeholder="SKU, item number or product…"
          tone="neutral"
          size="default"
          isSearching={catalog.isFetching}
          debounceMs={180}
          inputProps={{ 'aria-label': 'Find product' }}
        />
      </div>

      {catalog.isPending && rows.length === 0 ? (
        <UniversalLoader isLoading label="Loading products" className="min-h-48" />
      ) : catalog.isError ? (
        <p className="border-b border-mode-rule px-mode-page py-8 text-center text-role-data font-semibold text-text-danger">
          Couldn&apos;t load products.
        </p>
      ) : rows.length === 0 ? (
        <p className="border-b border-mode-rule px-mode-page py-8 text-center text-role-data font-semibold text-mode-ink">
          No products match that SKU or item number.
        </p>
      ) : (
        <ul className="divide-y divide-mode-rule" aria-label="Products">
          {rows.map((item) => {
            const itemNumber = item.platform_ids
              ?.map((id) => id.platform_item_id?.trim())
              .find(Boolean);
            return (
              <li key={item.id}>
                {/* The house row: press washes surface-selected, never an ink (black) inversion. */}
                <MobileDataListRow
                  href={`/m/products/${encodeURIComponent(item.sku)}`}
                  ariaLabel={`Open ${item.product_title || item.sku}`}
                  className="flex min-h-16 items-center gap-3 px-mode-page py-2 text-left"
                  testId="mobile-product-row"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden bg-surface-sunken ring-1 ring-inset ring-mode-rule">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="size-5 text-text-faint" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-role-data font-semibold">
                      {item.product_title || item.sku}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-role-micro text-mode-muted">
                      SKU {item.sku}{itemNumber ? ` · Item # ${itemNumber}` : ''}
                    </span>
                  </span>
                </MobileDataListRow>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
