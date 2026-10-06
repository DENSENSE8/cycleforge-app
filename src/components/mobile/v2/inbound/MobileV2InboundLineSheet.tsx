'use client';

/**
 * One inbound-order item, edited in a task-local sheet: find it in the
 * catalog (SKU or title) or type the title / SKU; quantity; unit price; the
 * listing (link, item # / ASIN); the condition it was bought at; the serials
 * the listing shows; the seller's listing photos (camera or library — held
 * until the order lands); on a return, the report's unit facts. The sheet
 * edits a copy — Done hands the item back, closing discards. A landed item
 * (fixing an order) is edited in place by the writer, so it is never removed.
 */

import { useState } from 'react';
import { Check, Trash2, X } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import type { DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Button, SearchField, TextField } from '@/design-system/primitives';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import { conditionOptions } from '@/lib/conditions';
import {
  formatInboundMoney,
  inboundLineCatalogPatch,
  inboundLineName,
  inboundLineSkuPatch,
  inboundLineTotalCents,
  parseInboundQuantityInput,
} from '@/lib/inbound/inbound-order-compose';
import { lineHasIdentity, type InboundOrderLine } from '@/lib/inbound/inbound-order-draft';
import {
  revokePendingListingPhotos,
  type LandedListingPhoto,
  type PendingListingPhoto,
} from '@/lib/inbound/use-inbound-order-form';
import { centsToInputText, inputTextToCents } from '@/utils/money';
import { InboundListingPhotos, InboundSerialsField } from './MobileV2InboundLineEvidence';
import { InboundSectionHeading } from './MobileV2InboundParts';

type LineVerb = 'remove' | 'done';

const CONDITION_CHOICES = conditionOptions('option');

export function MobileV2InboundLineSheet({
  line: initial,
  photos: initialPhotos,
  landedPhotos,
  position,
  landed,
  received,
  currency,
  isReturn,
  onDone,
  onRemove,
  onDeleteLanded,
  onClose,
}: {
  line: InboundOrderLine;
  /** The listing photos the form holds for this item. */
  photos: readonly PendingListingPhoto[];
  /** Photos already on the landed item (fixing an order). */
  landedPhotos: readonly LandedListingPhoto[];
  /** 1-based item number; null = a new item. */
  position: number | null;
  /** Already on the order — the writer keeps it, so it cannot be removed. */
  landed: boolean;
  /** Units already received on a landed item. */
  received: number;
  currency: string;
  isReturn: boolean;
  onDone: (line: InboundOrderLine, photos: PendingListingPhoto[]) => void;
  onRemove: () => void;
  onDeleteLanded: (photo: LandedListingPhoto) => void;
  onClose: () => void;
}) {
  const [line, setLine] = useState(initial);
  const [photos, setPhotos] = useState<PendingListingPhoto[]>(() => [...initialPhotos]);
  const [query, setQuery] = useState('');
  const [qtyText, setQtyText] = useState(() => (initial.quantity == null ? '' : String(initial.quantity)));
  const [priceText, setPriceText] = useState(() => centsToInputText(initial.unitCostCents));
  const debounced = useDebounce(query, 250);
  const search = useSkuCatalogSearch(debounced, { searchField: 'catalog', limit: 8 });
  const patch = (next: Partial<InboundOrderLine>) => setLine((l) => ({ ...l, ...next }));
  // Closing discards: the photos picked in this sheet are released; the form keeps its own.
  const discard = () => {
    revokePendingListingPhotos(photos.filter((p) => !initialPhotos.includes(p)));
    onClose();
  };
  const done = () => {
    revokePendingListingPhotos(initialPhotos.filter((p) => !photos.includes(p)));
    onDone(line, photos);
  };

  const verbs: DetailDockVerb<LineVerb>[] = [
    ...(position != null && !landed ? [{ id: 'remove' as const, label: 'Remove item', icon: <Trash2 />, variant: 'danger' as const, testId: 'm-inbound-line-remove' }] : []),
    {
      id: 'done',
      label: position == null ? 'Add item' : 'Done',
      icon: <Check />,
      primary: true,
      disabled: position == null && !lineHasIdentity(line),
      testId: 'm-inbound-line-done',
    },
  ];

  return (
    <MobileV2ActionSheet
      open
      onClose={discard}
      eyebrow={landed ? `${received} received` : undefined}
      title={position == null ? 'New item' : `Item ${position}`}
      description={landed ? 'Already on the order — saving edits this item in place.' : lineHasIdentity(line) ? inboundLineName(line) : 'Find or type the item'}
      verbs={verbs}
      onVerb={(verb) => (verb === 'done' ? done() : onRemove())}
      dockLabel="Item actions"
      testId="m-inbound-line-sheet"
    >
      <div className="flex flex-col gap-3 px-mode-page py-3">
        {line.skuCatalogId != null ? (
          <div className="flex items-center gap-2 text-role-caption text-text-muted" data-testid="m-inbound-line-paired">
            <span className="min-w-0 flex-1 break-words">
              Catalog product <span className="break-all font-mono text-text-default">{line.sku}</span>
            </span>
            <Button variant="secondary" size="sm" icon={<X />} onClick={() => patch(inboundLineCatalogPatch(line, null))}>
              Unpair
            </Button>
          </div>
        ) : (
          <SearchField value={query} onChange={setQuery} placeholder="Search the catalog — SKU or title" isSearching={search.isFetching} />
        )}
      </div>

      {line.skuCatalogId == null && debounced.trim() ? (
        <div className="border-t border-mode-rule" data-testid="m-inbound-line-results">
          <MobileRecordCardList label="Catalog matches">
            {(search.data ?? []).map((item) => (
              <MobileRecordCard
                key={item.id}
                identity={item.sku}
                title={item.product_title || item.sku}
                onOpen={() => {
                  patch(inboundLineCatalogPatch(line, item));
                  setQuery('');
                }}
                testId={`m-inbound-line-match-${item.id}`}
              />
            ))}
            {search.data && search.data.length === 0 && !search.isFetching ? (
              <p className="break-words text-role-caption text-text-muted">No catalog product matches — type the title or SKU below.</p>
            ) : null}
          </MobileRecordCardList>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-mode-page py-3">
        <TextField label="Title" value={line.title} onChange={(title) => patch({ title })} data-testid="m-inbound-line-title" />
        <TextField
          label="SKU"
          value={line.sku}
          mono
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(sku) => patch(inboundLineSkuPatch(line, sku))}
          data-testid="m-inbound-line-sku"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Qty *"
            value={qtyText}
            inputMode="numeric"
            aria-invalid={line.quantity == null || undefined}
            onChange={(raw) => {
              setQtyText(raw);
              patch({ quantity: parseInboundQuantityInput(raw) });
            }}
            data-testid="m-inbound-line-qty"
          />
          <TextField
            label="Unit price ($)"
            value={priceText}
            inputMode="decimal"
            onChange={(raw) => {
              setPriceText(raw);
              patch({ unitCostCents: inputTextToCents(raw) });
            }}
            data-testid="m-inbound-line-cost"
          />
        </div>
        <p className="flex items-baseline justify-between text-role-caption text-text-muted">
          <span>Line total</span>
          <span className="font-mono text-text-default">{formatInboundMoney(inboundLineTotalCents(line), currency)}</span>
        </p>
      </div>

      <InboundSectionHeading>Listing</InboundSectionHeading>
      <div className="flex flex-col gap-3 px-mode-page py-3">
        <TextField
          label={isReturn ? 'Listing link (the listing the buyer bought) *' : 'Listing link'}
          value={line.listingUrl}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          onChange={(listingUrl) => patch({ listingUrl })}
          data-testid="m-inbound-line-listing"
        />
        <TextField label="Item # / ASIN" value={line.itemNumber} mono autoCapitalize="characters" onChange={(itemNumber) => patch({ itemNumber })} />
        <SearchableSelectField
          label="Condition bought at"
          value={line.conditionGrade ?? null}
          onChange={(value) => patch({ conditionGrade: value == null ? null : (String(value) as NonNullable<InboundOrderLine['conditionGrade']>) })}
          options={CONDITION_CHOICES}
          placeholder="As the listing says"
          ariaLabel="Condition bought at"
          testId="m-inbound-line-condition"
        />
        <InboundSerialsField serials={line.listingSerials ?? []} onChange={(listingSerials) => patch({ listingSerials })} />
      </div>

      <InboundListingPhotos photos={photos} landedPhotos={landedPhotos} onPhotos={setPhotos} onDeleteLanded={onDeleteLanded} />

      {isReturn ? (
        <>
          <InboundSectionHeading>Return report</InboundSectionHeading>
          <div className="flex flex-col gap-3 px-mode-page py-3">
            <div className="grid grid-cols-2 gap-3">
              <TextField label="FNSKU" value={line.fnsku ?? ''} mono autoCapitalize="characters" onChange={(fnsku) => patch({ fnsku })} />
              <TextField label="LPN" value={line.licensePlateNumber ?? ''} mono autoCapitalize="characters" onChange={(licensePlateNumber) => patch({ licensePlateNumber })} />
            </div>
            <TextField label="Disposition" value={line.disposition ?? ''} onChange={(disposition) => patch({ disposition })} />
            <TextField label="Customer comment" value={line.customerComment ?? ''} multiline rows={2} onChange={(customerComment) => patch({ customerComment })} />
          </div>
        </>
      ) : null}
    </MobileV2ActionSheet>
  );
}
