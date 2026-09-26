'use client';

/** Catalog pairing — the first section of the exception editor. */

import { AlertCircle, Check } from '@/components/Icons';
import { Alert, AlertTitle } from '@/components/ui/alert';
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
 * by {@link ExceptionResolveSection} above the pairing card — never inside
 * the pairing panel.
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
}: {
  fieldId: string;
  row: OrderExceptionRow;
  query: string;
  onQueryChange: (value: string) => void;
  hits: CatalogHit[];
  searching: boolean;
  pairing: boolean;
  onPair: (skuCatalogId: number) => void;
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

  return (
    <div className="flex flex-col gap-2">
      <p className="text-role-caption text-text-muted">
        SKU creation and modification stay with Inventory Management / Accounting.
        This queue can only link an existing catalog item; send a missing item to Son
        and the Inventory team through their controlled workflow.
      </p>
      <IntakeCombobox
        triggerId={`${fieldId}-search`}
        className={triagePanelControl('w-full')}
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
    </div>
  );
}
