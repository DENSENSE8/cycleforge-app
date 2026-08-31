'use client';

import { AlertCircle, Check, Loader2 } from '@/components/Icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';

export interface CatalogHit {
  id: number;
  sku: string;
  product_title?: string | null;
  productTitle?: string | null;
}

export function ExceptionCatalogPairing({
  fieldId,
  row,
  query,
  onQueryChange,
  hits,
  searching,
  pairing,
  onPair,
  sku,
  title,
  newCategory,
  onNewCategoryChange,
  categories,
  creating,
  onCreateAndPair,
}: {
  fieldId: string;
  row: OrderExceptionRow;
  query: string;
  onQueryChange: (value: string) => void;
  hits: CatalogHit[];
  searching: boolean;
  pairing: boolean;
  onPair: (skuCatalogId: number) => void;
  sku: string;
  title: string;
  newCategory: string;
  onNewCategoryChange: (value: string) => void;
  categories: string[];
  creating: boolean;
  onCreateAndPair: () => void;
}) {
  if (row.skuCatalogId) {
    return (
      <Alert variant="success">
        <Check aria-hidden />
        <AlertTitle>
          Paired to <span className="font-mono">{row.catalogSku}</span>
        </AlertTitle>
        {row.catalogTitle ? <AlertDescription>{row.catalogTitle}</AlertDescription> : null}
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <Alert variant="warning">
        <AlertCircle aria-hidden />
        <AlertTitle>This item number resolves to nothing in the catalog</AlertTitle>
        <AlertDescription>
          So the order has no item display.
          {row.siblingUnpairedCount > 0
            ? ` Pairing it also clears ${row.siblingUnpairedCount} other order${row.siblingUnpairedCount === 1 ? '' : 's'} carrying this item number.`
            : ''}
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-search`}>Link an existing catalog item</Label>
        <Command shouldFilter={false} className="border border-border-soft">
          <CommandInput
            id={`${fieldId}-search`}
            value={query}
            onValueChange={onQueryChange}
            placeholder="Search catalog by SKU or title…"
            data-testid="exception-catalog-search"
          />
          <CommandList>
            {searching ? (
              <div className="px-3 py-2 text-role-micro text-text-faint">Searching…</div>
            ) : (
              <CommandEmpty>
                {query.trim() ? 'No catalog item matches.' : 'Type to search the catalog.'}
              </CommandEmpty>
            )}
            {hits.length > 0 ? (
              <CommandGroup heading="Catalog">
                {hits.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    value={String(hit.id)}
                    disabled={pairing}
                    onSelect={() => onPair(hit.id)}
                    data-testid={`exception-catalog-hit-${hit.id}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-role-caption font-semibold text-text-default">
                        {hit.sku}
                      </span>
                      <span className="block truncate text-role-micro text-text-soft">
                        {hit.productTitle ?? hit.product_title ?? ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-role-micro font-semibold text-blue-600">
                      Link
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label>Or create a new catalog item from this order</Label>
        <p className="text-role-micro text-text-faint">
          SKU <span className="font-mono">{sku || row.sku || '—'}</span> · title{' '}
          {title || row.productTitle || '—'}
        </p>
        <Input
          value={newCategory}
          onChange={(e) => onNewCategoryChange(e.target.value)}
          placeholder="Category (optional)"
          list={`${fieldId}-categories`}
          data-testid="exception-new-category"
        />
        <datalist id={`${fieldId}-categories`}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Button
          variant="default"
          size="md"
          disabled={creating || pairing}
          onClick={() => onCreateAndPair()}
          data-testid="exception-create-sku"
        >
          {creating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…
            </>
          ) : (
            'Create catalog item and pair'
          )}
        </Button>
      </div>
    </div>
  );
}
