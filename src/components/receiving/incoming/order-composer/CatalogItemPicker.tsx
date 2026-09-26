'use client';

/** Zoho-inventory item search for a return: type, pick one, or change it. */

import { useState } from 'react';
import { Search } from '@/components/Icons';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { RECORD_ID_CLASS, RECORD_TITLE_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { ComposerButton, ComposerField, ComposerInput } from './receiving-order-composer-parts';

export function CatalogItemPicker({
  picked,
  onPick,
}: {
  picked: SkuCatalogItem | null;
  onPick: (item: SkuCatalogItem | null) => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const search = useSkuCatalogSearch(debounced, { searchField: 'zoho_catalog', limit: 12 });

  if (picked) {
    return (
      <div className="flex items-center gap-3 border border-mode-ink bg-mode-canvas px-3 py-2" data-testid="composer-picked-item">
        <div className="min-w-0 flex-1">
          <p className={RECORD_TITLE_CLASS}>{picked.product_title || picked.sku}</p>
          <p className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>{picked.sku}</p>
        </div>
        <ComposerButton tone="ghost" onClick={() => onPick(null)}>
          Change
        </ComposerButton>
      </div>
    );
  }

  const rows = search.data ?? [];
  return (
    <div className="flex flex-col gap-1">
      <ComposerField label="Inventory item" required missing>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-mode-faint" />
          <ComposerInput
            value={query}
            placeholder="Search SKU or title"
            className="pl-8"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </ComposerField>
      {debounced.trim() ? (
        <ul className="max-h-56 overflow-y-auto border border-mode-rule" aria-label="Inventory matches">
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-role-caption text-mode-muted">
              {search.isFetching ? 'Searching…' : search.isError ? 'Inventory search failed.' : 'No inventory item matches.'}
            </li>
          ) : (
            rows.map((item) => (
              <li key={item.id} className="border-b border-mode-rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className={cn('flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-mode-hover', focusRing('control'))}
                >
                  <span className={cn(RECORD_ID_CLASS, 'w-32 shrink-0 truncate text-mode-muted')}>{item.sku}</span>
                  <span className="min-w-0 flex-1 truncate text-role-data">{item.product_title}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
