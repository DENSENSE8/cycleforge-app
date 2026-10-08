'use client';

/**
 * First-class Zoho product combobox for item-level OOS.
 * Reuses IntakeCombobox + searchField=zoho_catalog. Never paints line-N.
 *
 * Callers: MorphingRowActionMenu (the Report out of stock dialog).
 */

import { useEffect, useMemo, useState } from 'react';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import type { KitComposition } from '@/lib/orders/order-kit-composition';
import {
  identityFromParsedOos,
  oosOptionsFromZohoCatalogHits,
  oosOptionsOnThisOrder,
  parseOosComboboxValue,
  type OosComboboxLine,
} from '@/lib/orders/oos-combobox-options';
import type { OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';
import { morphingOosOrderId } from '@/lib/outbound/morphing-oos';
import { cn } from '@/utils/_cn';

export function OosProductCombobox({
  lines,
  compositionByCatalogId,
  onPick,
  disabled = false,
  className,
  surface = 'trigger',
}: {
  lines: readonly OosComboboxLine[];
  compositionByCatalogId?: ReadonlyMap<number, KitComposition>;
  onPick: (orderRowId: number, identity: OrderShortageIdentity) => void;
  disabled?: boolean;
  className?: string;
  /** `open`: search and list in place, search focused — inside the Report out of stock dialog. */
  surface?: 'trigger' | 'open';
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const bindId = morphingOosOrderId(lines.length === 1 ? lines[0]! : {});
  const search = useSkuCatalogSearch(debounced, {
    limit: 12,
    searchField: 'zoho_catalog',
  });

  const options = useMemo(() => {
    const onOrder = oosOptionsOnThisOrder(lines, compositionByCatalogId);
    const seen = new Set(onOrder.map((o) => o.value));
    const catalogBind = bindId ?? (lines.length > 0 ? morphingOosOrderId(lines[0]!) : null);
    const catalog = oosOptionsFromZohoCatalogHits(
      (search.data ?? []).map((hit) => ({
        id: hit.id,
        sku: hit.sku,
        product_title: hit.product_title,
        zoho_item_id: (hit as { zoho_item_id?: string | null }).zoho_item_id,
        image_url: hit.image_url,
      })),
      catalogBind,
    ).filter((opt) => !seen.has(opt.value));
    return [...onOrder, ...catalog];
  }, [bindId, compositionByCatalogId, lines, search.data]);

  return (
    <div className={cn(surface === 'open' ? 'flex h-full min-h-0 w-full flex-col' : 'min-w-[14rem] max-w-[22rem] flex-1', className)}>
      <IntakeCombobox
        value={null}
        onChange={(value) => {
          const parsed = parseOosComboboxValue(value);
          if (!parsed) return;
          const opt = options.find((o) => o.value === value);
          onPick(
            parsed.orderRowId,
            identityFromParsedOos(parsed, {
              title: opt?.label ?? parsed.title,
              qtyShort: 1,
            }),
          );
        }}
        options={options}
        placeholder="Select product…"
        searchPlaceholder="Search products by name or SKU…"
        emptyMessage="No products"
        disabled={disabled}
        ariaLabel="Out of stock product"
        testId="oos-product-combobox"
        query={query}
        onQueryChange={setQuery}
        loading={debounced.length > 0 && search.isFetching}
        surface={surface}
        className={surface === 'open' ? 'flex-1' : undefined}
      />
    </div>
  );
}
