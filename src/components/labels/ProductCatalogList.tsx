'use client';

/**
 * Zoho catalog product list for Products Labels workbench.
 * Extracted from the former sidebar ProductPickerList — browse/search only;
 * recency lives on the Printed sidebar rail.
 */

import { Printer } from '@/components/Icons';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { cn } from '@/utils/_cn';

interface ProductCatalogListProps {
  query: string;
  onPick: (sku: string) => void;
  /** Optional selected SKU for highlight (when the print form mirrors URL state). */
  selectedSku?: string | null;
  className?: string;
}

export function ProductCatalogList({
  query,
  onPick,
  selectedSku,
  className,
}: ProductCatalogListProps) {
  // Sources from the Zoho `items` mirror via `zoho_catalog` — canonical inventory
  // SKU + Zoho name. NOT `sku_catalog`/`sku_stock` (independent SKU numbering).
  const { data, isLoading, isError } = useSkuCatalogSearch(query, {
    limit: 50,
    allowEmpty: true,
    searchField: 'zoho_catalog',
  });

  const items = data ?? [];
  const trimmedQuery = query.trim();
  const selected = selectedSku?.trim().toUpperCase() ?? '';

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && items.length === 0 ? (
          <div className="inset-empty text-center text-role-caption font-semibold text-text-faint">
            Loading products…
          </div>
        ) : isError ? (
          <div className="inset-empty text-center text-role-caption font-semibold text-red-500">
            Couldn&apos;t load products.
          </div>
        ) : items.length === 0 ? (
          <div className="inset-empty text-center text-role-caption font-semibold text-text-faint">
            {trimmedQuery ? 'No matches.' : 'No products available.'}
          </div>
        ) : (
          <ul className="divide-y divide-border-hairline" aria-label="Product catalog">
            {items.map((item) => (
              <ProductCatalogRow
                key={item.id}
                item={item}
                onPick={onPick}
                isSelected={selected.length > 0 && item.sku.toUpperCase() === selected}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProductCatalogRow({
  item,
  onPick,
  isSelected,
}: {
  item: SkuCatalogItem;
  onPick: (sku: string) => void;
  isSelected: boolean;
}) {
  return (
    <li>
      {/* ds-raw-button: catalog picker list-row (image + title/sku), one-row anatomy — not the Button primitive shape */}
      <button
        type="button"
        onClick={() => onPick(item.sku)}
        aria-current={isSelected ? 'true' : undefined}
        className={cn(
          'ds-raw-button flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
          isSelected ? 'bg-blue-50' : 'hover:bg-blue-50',
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-canvas ring-1 ring-border-soft">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <Printer className="h-4 w-4 text-text-faint" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="break-words text-role-caption font-semibold leading-snug text-text-default">
            {item.product_title || item.sku}
          </span>
          <span className="truncate font-mono text-role-micro text-text-soft">{item.sku}</span>
        </span>
      </button>
    </li>
  );
}
