'use client';

/**
 * Pair a cart line to a catalog product — the phone face of the desk cart's
 * "Pair to a catalog product" search. Same search core (`searchProducts`),
 * same patch (`pairLineToHit`), the Products step's own find tiles.
 */

import { useEffect, useState } from 'react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TriageShelfGrid } from '@/design-system/components/triage-shelf/TriageShelfGrid';
import { TriageShelfTile } from '@/design-system/components/triage-shelf/TriageShelfTile';
import { TextField } from '@/design-system/primitives/TextField';
import { hitAvailability, pairLineToHit } from '@/lib/orders/intake/checkout-model';
import { searchProducts } from '@/lib/orders/intake/intake-product-client';
import type { IntakeLine } from '@/lib/orders/intake/intake-model';
import type { IntakeProductHit } from '@/lib/orders/intake-product-search';
import { formatCents } from '@/lib/orders/manual-order-draft';

const SEARCH_DEBOUNCE_MS = 200;

export function MobileLinePairSheet({
  line,
  currency,
  onClose,
  onPair,
}: {
  /** The line being paired; `null` closes the sheet. */
  line: IntakeLine | null;
  currency: string;
  onClose: () => void;
  onPair: (key: string, patch: Partial<IntakeLine>) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<IntakeProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const seed = line ? line.sku || line.title : '';
  const q = query.trim() || seed.trim();

  useEffect(() => {
    if (line) setQuery('');
  }, [line]);

  useEffect(() => {
    if (!line || q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchProducts(q, ctrl.signal)
        .then(setHits)
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [line, q]);

  return (
    <Sheet open={line != null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>Pair to a catalog product</SheetTitle>
        </SheetHeader>
        <SheetBody className="px-0 pt-0" data-testid="m-order-pair">
          <div className="px-mode-page py-3">
            <TextField
              label="Find the catalog product — title, SKU, item #, UPC"
              placeholder={seed || 'Title, SKU, item #, UPC'}
              value={query}
              onChange={setQuery}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputClassName="text-base"
              data-testid="m-order-pair-query"
            />
          </div>
          <TriageShelfGrid
            label="Catalog products"
            count={hits.length}
            loading={loading}
            error={null}
            empty="No catalog product matches — try the SKU or item #."
            testId="m-order-pair-hits"
          >
            {hits.map((hit, index) => (
              <TriageShelfTile
                key={hit.skuCatalogId}
                title={hit.title}
                imageUrl={hit.imageUrl}
                price={hit.suggestedUnitCents != null ? formatCents(hit.suggestedUnitCents, currency) : null}
                sku={hit.sku}
                availability={hitAvailability(hit)}
                inCart={0}
                index={index}
                onAdd={() => {
                  if (!line) return;
                  onPair(line.key, pairLineToHit(line, hit));
                  onClose();
                }}
                testId="m-order-pair-hit"
              />
            ))}
          </TriageShelfGrid>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
