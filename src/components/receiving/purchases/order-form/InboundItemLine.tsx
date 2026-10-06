'use client';

/**
 * One item of the inbound order: the catalog product (fills the SKU and
 * title) or typed SKU / title, quantity, unit price, the listing (link, item #
 * / ASIN), the condition it was bought at, the serials the listing shows, the
 * seller's listing photos — and, on a return, the return report's unit facts
 * (FNSKU, LPN, disposition, customer comment).
 */

import { useMemo, useState } from 'react';
import { Trash2 } from '@/components/Icons';
import { ExternalLinkActionIcon } from '@/design-system/components/ExternalLinkActionIcon';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { IconButton, TextField } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import { conditionOptions } from '@/lib/conditions';
import {
  addInboundLineSerials,
  formatInboundMoney,
  inboundLineCatalogPatch,
  inboundLineSkuPatch,
  inboundLineTotalCents,
  openableListingUrl,
  parseInboundQuantityInput,
  type InboundCatalogPick,
} from '@/lib/inbound/inbound-order-compose';
import type { InboundOrderLine } from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderFormModel } from '@/lib/inbound/use-inbound-order-form';
import { cn } from '@/utils/_cn';
import { centsToInputText, inputTextToCents } from '@/utils/money';
import { ListingPhotosField } from './ListingPhotosField';
import { PastedTokensField } from './order-form-fields';

const CONDITION_CHOICES = conditionOptions('option');

export function InboundItemLine({
  form,
  index,
  lineKey,
  action,
}: {
  form: InboundOrderFormModel;
  index: number;
  /** The key the line lands with (its own, else L{n}). */
  lineKey: string;
  /** What the dry run says landing does to this line. */
  action: 'create' | 'update' | null;
}) {
  const { draft, missing } = form;
  const line = draft.lines[index]!;
  const isReturn = draft.type === 'RETURN';
  const flagged = (field: 'line_identity' | 'quantity' | 'listing_url') => missing.some((m) => m.field === field && m.lines?.includes(index));
  const identityMissing = flagged('line_identity') || (isReturn && missing.some((m) => m.field === 'return_item'));
  const patch = (next: Partial<InboundOrderLine>) => form.patchLine(index, next);

  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const search = useSkuCatalogSearch(debounced, { searchField: 'catalog', limit: 12 });
  const options = useMemo(() => {
    const rows = (search.data ?? []).map((item) => ({ value: item.id, label: item.product_title || item.sku, meta: item.sku, data: item as InboundCatalogPick }));
    if (line.skuCatalogId != null && !rows.some((r) => r.value === line.skuCatalogId)) {
      rows.unshift({ value: line.skuCatalogId, label: line.title || line.sku, meta: line.sku, data: { id: line.skuCatalogId, sku: line.sku, product_title: line.title } });
    }
    return rows;
  }, [search.data, line.skuCatalogId, line.title, line.sku]);

  // The draft owns the price; the text keeps what was typed only while it still reads as that price (a document fill replaces it).
  const [priceText, setPriceText] = useState(() => centsToInputText(line.unitCostCents));
  const shownPrice = inputTextToCents(priceText) === line.unitCostCents ? priceText : centsToInputText(line.unitCostCents);
  const listingHref = openableListingUrl(line.listingUrl);
  const serials = line.listingSerials ?? [];
  const position = index + 1;

  return (
    <li className="flex flex-col gap-3 border-b border-mode-divide px-4 py-4 last:border-b-0" data-testid={`inbound-line-${index}`}>
      <div className="flex items-center gap-2">
        <span className="text-role-body font-medium text-text-default">Item {position}</span>
        <span className={cn(RECORD_ID_CLASS, 'text-text-muted')}>{lineKey}</span>
        {action ? (
          <span className={cn('text-role-caption', action === 'create' ? 'text-text-success' : 'text-text-warning')}>
            {action === 'create' ? 'New line' : 'Updates the landed line'}
          </span>
        ) : null}
        <span className="flex-1" />
        <span className="flex items-baseline gap-1.5 text-role-caption">
          <span className="text-text-muted">Line total</span>
          <span className={cn(RECORD_ID_CLASS, 'text-text-default')}>{formatInboundMoney(inboundLineTotalCents(line), draft.currency)}</span>
        </span>
        <IconButton
          size="md"
          icon={<Trash2 className="h-4 w-4" />}
          ariaLabel={`Remove item ${position}`}
          disabled={draft.lines.length === 1 || (form.record?.landedLineKeys.includes(line.lineKey) ?? false)}
          title={form.record?.landedLineKeys.includes(line.lineKey) ? 'Already on the order — the writer keeps it' : undefined}
          onClick={() => form.removeLine(index)}
        />
      </div>

      <SearchableSelectField
        label={isReturn ? 'Catalog product *' : 'Catalog product'}
        value={line.skuCatalogId}
        onChange={(value, option) =>
          patch(inboundLineCatalogPatch(line, value == null ? null : (option?.data ?? { id: Number(value), sku: line.sku, product_title: line.title })))
        }
        options={options}
        filter={() => true}
        onSearchChange={setQuery}
        loading={search.isFetching}
        placeholder="Search the catalog by SKU or title"
        searchPlaceholder="SKU or title"
        emptyMessage={debounced.trim() ? 'No catalog product matches — type the SKU / title below' : 'Type to search'}
        ariaLabel={`Catalog product for item ${position}`}
        className={cn(identityMissing && 'ring-1 ring-border-warning')}
        testId={`inbound-line-catalog-${index}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[10rem_minmax(0,1fr)_6rem_8rem]">
        <TextField label="SKU" value={line.sku} mono onChange={(sku) => patch(inboundLineSkuPatch(line, sku))} aria-invalid={identityMissing || undefined} />
        <TextField label="Title" value={line.title} onChange={(title) => patch({ title })} aria-invalid={identityMissing || undefined} />
        <TextField
          label="Qty *"
          value={line.quantity == null ? '' : String(line.quantity)}
          inputMode="numeric"
          aria-invalid={flagged('quantity') || undefined}
          onChange={(raw) => patch({ quantity: parseInboundQuantityInput(raw) })}
        />
        <TextField
          label="Unit price ($)"
          value={shownPrice}
          inputMode="decimal"
          onChange={(raw) => {
            setPriceText(raw);
            patch({ unitCostCents: inputTextToCents(raw) });
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <TextField
          label={isReturn ? 'Listing link (the listing the buyer bought) *' : 'Listing link'}
          value={line.listingUrl}
          type="url"
          aria-invalid={flagged('listing_url') || undefined}
          onChange={(listingUrl) => patch({ listingUrl })}
          trailing={listingHref ? <ExternalLinkActionIcon href={listingHref} radius="control" ariaLabel="Open listing in a new tab" title="Open listing" /> : null}
        />
        <TextField label="Item # / ASIN" value={line.itemNumber} mono onChange={(itemNumber) => patch({ itemNumber })} />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <SearchableSelectField
          label="Condition bought at"
          value={line.conditionGrade ?? null}
          onChange={(value) => patch({ conditionGrade: value == null ? null : (String(value) as NonNullable<InboundOrderLine['conditionGrade']>) })}
          options={CONDITION_CHOICES}
          placeholder="As the listing says"
          ariaLabel={`Condition bought at for item ${position}`}
        />
        <PastedTokensField
          label="Listing serials — Enter or paste many"
          tokens={serials}
          onAdd={(added) => patch(addInboundLineSerials(line, added))}
          onRemove={(at) => patch({ listingSerials: serials.filter((_, i) => i !== at) })}
          testId={`inbound-line-serials-${index}`}
        />
      </div>

      <ListingPhotosField
        position={position}
        pending={form.photos[index] ?? []}
        landed={form.landedPhotos(line)}
        onAdd={(files) => form.addPhotos(index, files)}
        onRemovePending={(key) => form.removePhoto(index, key)}
        onDeleteLanded={(photo) => void form.deleteLandedPhoto(photo)}
      />

      {isReturn ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid={`inbound-line-return-${index}`}>
          <TextField label="FNSKU" value={line.fnsku ?? ''} mono onChange={(fnsku) => patch({ fnsku })} />
          <TextField label="LPN" value={line.licensePlateNumber ?? ''} mono onChange={(licensePlateNumber) => patch({ licensePlateNumber })} />
          <TextField label="Disposition" value={line.disposition ?? ''} onChange={(disposition) => patch({ disposition })} />
          <TextField
            label="Customer comment"
            value={line.customerComment ?? ''}
            multiline
            rows={2}
            onChange={(customerComment) => patch({ customerComment })}
            className="sm:col-span-3"
          />
        </div>
      ) : null}
    </li>
  );
}
