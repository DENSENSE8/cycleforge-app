'use client';

/**
 * Catalog pairing — the first section of the exception editor.
 *
 * There are exactly two answers to "this item number resolves to nothing":
 * point it at an inventory item that exists, or make the one it should have
 * been. So there are exactly two controls, on one row, both at
 * {@link triagePanelControl} size so neither reads as the lesser option by
 * accident of height.
 *
 * It used to be nine blocks — a three-line Alert, a labelled `Command` with its
 * own list/empty/loading markup, a `Separator`, a second heading, an echo of
 * the SKU and title already visible in Order Details below, a category `Input`
 * with a `<datalist>` fed by a 500-row catalog fetch, and the button. Every one
 * of those explained the surface instead of operating it, and the `Command`
 * block was a hand-rolled second copy of {@link IntakeCombobox} — the picker
 * order intake already uses. Now it composes that primitive, and category is
 * set where categories are managed rather than in the middle of a triage queue.
 *
 * The "unpaired" notice is NOT here: it states a fact about the ORDER, so it
 * rides the editor's banner slot above this card ({@link ExceptionUnpairedBanner}).
 * Filing it under a "Catalog Pairing" heading implied the problem was local to
 * this panel — which is also why the header badge kept reading as a duplicate.
 *
 * The search reads the LOCAL Zoho inventory mirror (`searchField=zoho_catalog`
 * → the `items` table joined to `sku_catalog` on `provider_item_id`), never the
 * Zoho API. See `ExceptionEditor` for the call.
 */

import { AlertCircle, Check, Loader2 } from '@/components/Icons';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { cn } from '@/utils/_cn';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import {
  TRIAGE_PANEL_INNER_CORNER,
  triagePanelControl,
} from '@/design-system/tokens/triage-panel';

export interface CatalogHit {
  id: number;
  sku: string;
  product_title?: string | null;
  productTitle?: string | null;
  image_url?: string | null;
}

/**
 * The record-level "nothing in the catalog answers to this" notice. Rendered
 * by {@link ExceptionEditor} into the layout's banner slot, above the first
 * card — never inside the pairing panel.
 */
export function ExceptionUnpairedBanner({ row }: { row: OrderExceptionRow }) {
  if (row.skuCatalogId) return null;
  const siblings = row.siblingUnpairedCount;
  return (
    <Alert variant="warning" className={TRIAGE_PANEL_INNER_CORNER}>
      <AlertCircle aria-hidden />
      {/* AlertTitle, not AlertDescription: with one line, that line IS the
          message — description tone (dimmed, regular weight) would render the
          only sentence here as a footnote to nothing. */}
      <AlertTitle>
        <span className="font-mono">{row.itemNumber || row.sku || '—'}</span> matches no
        catalog item
        {siblings > 0
          ? ` — pairing also clears ${siblings} other order${siblings === 1 ? '' : 's'}`
          : ''}
        .
      </AlertTitle>
    </Alert>
  );
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
  creating: boolean;
  onCreateAndPair: () => void;
}) {
  if (row.skuCatalogId) {
    return (
      <Alert variant="success" className={TRIAGE_PANEL_INNER_CORNER}>
        <Check aria-hidden />
        <AlertTitle>
          Paired to <span className="font-mono">{row.catalogSku}</span>
          {row.catalogTitle ? ` · ${row.catalogTitle}` : ''}
        </AlertTitle>
      </Alert>
    );
  }

  const newSku = (sku || row.sku || '').trim();

  return (
    // Both routes out of "unpaired" on one row, both reachable without opening
    // anything — the workbench e2e asserts exactly that. Link is the common
    // case so it takes the width; create is the fallback and lands hard right,
    // where every commit control on this surface now lives.
    <div className="flex flex-wrap items-center justify-end gap-2">
      <IntakeCombobox
        triggerId={`${fieldId}-search`}
        className={triagePanelControl('w-full min-w-56 flex-1 sm:w-auto')}
        // The open panel takes the trigger's corner; `overflow-hidden` is what
        // makes cmdk's square fill clip to it.
        contentClassName={cn('overflow-hidden', TRIAGE_PANEL_INNER_CORNER)}
        value={null}
        onChange={(value) => onPair(Number(value))}
        options={hits.map((hit) => ({
          value: String(hit.id),
          label: hit.sku,
          mono: true,
          meta: hit.productTitle ?? hit.product_title ?? undefined,
          imageUrl: hit.image_url,
        }))}
        query={query}
        onQueryChange={onQueryChange}
        loading={searching}
        disabled={pairing}
        placeholder="Link an existing catalog item…"
        searchPlaceholder="Search inventory by SKU or title…"
        emptyMessage={query.trim() ? 'Nothing matches.' : 'Type to search inventory.'}
        ariaLabel="Link an existing catalog item"
        testId="exception-catalog-search"
        optionTestId={(opt) => `exception-catalog-hit-${opt.value}`}
      />
      <Button
        variant="outline"
        size="md"
        disabled={creating || pairing}
        onClick={() => onCreateAndPair()}
        className={triagePanelControl()}
        data-testid="exception-create-sku"
      >
        {creating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…
          </>
        ) : (
          <>
            Create <span className="max-w-32 truncate font-mono">{newSku || 'new item'}</span>
          </>
        )}
      </Button>
    </div>
  );
}
