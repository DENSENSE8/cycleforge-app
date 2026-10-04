'use client';

/**
 * One inbound-order line, edited in a task-local sheet: find it in the catalog
 * (SKU or title), or type the title / SKU; quantity; unit cost. The sheet edits
 * a copy — Done hands the line back, closing discards. A landed line (fixing a
 * wrong import) is edited in place by the writer, so it is never removed here.
 */

import { useState } from 'react';
import { Check, Trash2, X } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import type { DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { Button, SearchField, TextField } from '@/design-system/primitives';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import {
  formatInboundMoney,
  inboundLineCatalogPatch,
  inboundLineName,
  inboundLineSkuPatch,
  inboundLineTotalCents,
  parseInboundQuantityInput,
} from '@/lib/inbound/inbound-order-compose';
import { lineHasIdentity, type InboundOrderLine } from '@/lib/inbound/inbound-order-draft';
import { centsToInputText, inputTextToCents } from '@/utils/money';

type LineVerb = 'remove' | 'done';

export function MobileV2InboundLineSheet({
  line: initial,
  position,
  landed,
  received,
  currency,
  onDone,
  onRemove,
  onClose,
}: {
  line: InboundOrderLine;
  /** 1-based line number; null = a new line. */
  position: number | null;
  /** Already on the order — the writer keeps it, so it cannot be removed. */
  landed: boolean;
  /** Units already received on a landed line. */
  received: number;
  currency: string;
  onDone: (line: InboundOrderLine) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [line, setLine] = useState(initial);
  const [query, setQuery] = useState('');
  const [qtyText, setQtyText] = useState(() => (initial.quantity == null ? '' : String(initial.quantity)));
  const [costText, setCostText] = useState(() => centsToInputText(initial.unitCostCents));
  const debounced = useDebounce(query, 250);
  const search = useSkuCatalogSearch(debounced, { searchField: 'catalog', limit: 8 });
  const patch = (next: Partial<InboundOrderLine>) => setLine((l) => ({ ...l, ...next }));
  const total = inboundLineTotalCents(line);

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
      onClose={onClose}
      eyebrow={landed ? `${received} received` : undefined}
      title={position == null ? 'New item' : `Item ${position}`}
      description={landed ? 'Already on the order — saving edits this line in place.' : lineHasIdentity(line) ? inboundLineName(line) : 'Find or type the item'}
      verbs={verbs}
      onVerb={(verb) => (verb === 'done' ? onDone(line) : onRemove())}
      dockLabel="Item actions"
      testId="m-inbound-line-sheet"
    >
      <div className="flex flex-col gap-3 px-mode-page py-3">
        {line.skuCatalogId != null ? (
          <div className="flex items-center gap-2 text-role-caption text-text-muted" data-testid="m-inbound-line-paired">
            <span className="min-w-0 flex-1 break-words">
              Catalog item <span className="break-all font-mono text-text-default">{line.sku}</span>
            </span>
            <Button variant="secondary" size="sm" icon={<X />} onClick={() => patch(inboundLineCatalogPatch(line, null))}>
              Unpair
            </Button>
          </div>
        ) : (
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search the catalog — SKU or title"
            isSearching={search.isFetching}
          />
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
              <p className="break-words text-role-caption text-text-muted">No catalog item matches — type the title or SKU below.</p>
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
            label="Unit cost"
            value={costText}
            inputMode="decimal"
            onChange={(raw) => {
              setCostText(raw);
              patch({ unitCostCents: inputTextToCents(raw) });
            }}
            data-testid="m-inbound-line-cost"
          />
        </div>
        <p className="flex items-baseline justify-between text-role-caption text-text-muted">
          <span>Line total</span>
          <span className="font-mono text-text-default">{formatInboundMoney(total, currency)}</span>
        </p>
      </div>
    </MobileV2ActionSheet>
  );
}
