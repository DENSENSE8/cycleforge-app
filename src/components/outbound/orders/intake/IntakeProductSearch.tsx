'use client';

/**
 * The ONE product search on the intake form: type anything — title words, a
 * SKU, an item #, an FNSKU, a UPC, "black bose 151 bracket" — and pick a
 * catalog product (`GET /api/orders/intake/products`, the shared search cores).
 * A pick hands back the product with its item #, identity title and SKU paired.
 */

import { useEffect, useState } from 'react';
import { Package } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import type { IntakeProductHit } from '@/lib/orders/intake-product-search';
import { searchProducts } from '@/lib/orders/intake/intake-product-client';
import { cn } from '@/utils/_cn';

/** Debounce between keystrokes and the search call. */
const SEARCH_DEBOUNCE_MS = 200;

export function IntakeProductSearch({
  onPick,
  seed = '',
  placeholder = 'Search products — title, SKU, item #, FNSKU, UPC',
  testId,
  className,
}: {
  onPick: (hit: IntakeProductHit) => void;
  /** Words to search before the operator types (a pasted line's title). */
  seed?: string;
  placeholder?: string;
  testId?: string;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<IntakeProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const q = (query.trim() || seed.trim());

  useEffect(() => {
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchProducts(q, ctrl.signal)
        .then((next) => setHits(next))
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [q]);

  return (
    <SearchableSelectField<IntakeProductHit>
      value={null}
      onChange={(_value, option) => {
        if (option?.data) onPick(option.data);
      }}
      options={hits.map((hit) => ({ value: hit.skuCatalogId, label: hit.title, data: hit }))}
      onSearchChange={setQuery}
      loading={loading}
      placeholder={placeholder}
      searchPlaceholder="Title, SKU, item #, FNSKU, UPC or a description"
      emptyMessage={q.length < 2 ? 'Type to search the catalog' : 'No catalog product matches'}
      ariaLabel="Search products"
      testId={testId}
      className={cn('h-11 rounded-mode-control px-3.5 text-sm', className)}
      renderOption={(opt) => <ProductHitRow hit={opt.data!} />}
    />
  );
}

function ProductHitRow({ hit }: { hit: IntakeProductHit }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 py-0.5" data-testid="intake-product-hit">
      {hit.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog photos are remote, unsized thumbnails
        <img src={hit.imageUrl} alt="" className="size-10 shrink-0 bg-surface-sunken object-cover" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center bg-surface-sunken text-text-faint">
          <Package className="size-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-role-caption font-medium text-text-default">{hit.title}</span>
        <span className="block truncate text-role-micro text-text-muted">
          {[hit.sku, hit.itemNumber ? `Item ${hit.itemNumber}` : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="shrink-0 text-right text-role-micro text-text-muted">
        <span className={cn('block', hit.onHand > 0 ? 'text-text-success' : 'text-text-faint')}>
          {hit.onHand > 0 ? `${hit.onHand} in stock` : 'None in stock'}
        </span>
        {hit.bin ? <span className="block">Bin {hit.bin}</span> : null}
      </span>
    </span>
  );
}
