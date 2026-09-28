'use client';

/**
 * Items section of the inbound-order form. Each line is one product: a
 * catalog item (the internal item master — sku_catalog, no external mirror)
 * or free SKU / title text, an explicit quantity, its cost, its listing, and
 * an optional source line id. Lines without an id land as L1..Ln.
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from '@/components/Icons';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { FormField } from '@/design-system/components/FormField';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { TRIAGE_PANEL_INNER_CORNER } from '@/design-system/tokens/triage-panel';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import {
  assignInboundLineKeys,
  emptyInboundOrderLine,
  type InboundOrderDraft,
  type InboundOrderLine,
  type InboundOrderNeed,
} from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderPreview } from '@/lib/inbound/ingest-inbound-order';
import { cn } from '@/utils/_cn';

interface LinesProps {
  draft: InboundOrderDraft;
  missing: readonly InboundOrderNeed[];
  preview: InboundOrderPreview | null;
  onChange: (lines: InboundOrderLine[]) => void;
}

function centsToText(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

export function InboundOrderLines({ draft, missing, preview, onChange }: LinesProps) {
  const keys = assignInboundLineKeys(draft.lines);
  const flagged = (field: InboundOrderNeed['field'], index: number) =>
    missing.some((m) => m.field === field && m.lines?.includes(index));

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        {draft.lines.map((line, index) => (
          <LineRow
            key={index}
            index={index}
            line={line}
            lineKey={keys[index]}
            action={preview?.lines.find((l) => l.index === index)?.action ?? null}
            identityMissing={flagged('line_identity', index)}
            quantityMissing={flagged('quantity', index)}
            removable={draft.lines.length > 1}
            onRemove={() => onChange(draft.lines.filter((_, i) => i !== index))}
            onChange={(next) => onChange(draft.lines.map((l, i) => (i === index ? { ...l, ...next } : l)))}
          />
        ))}
      </ol>
      <div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus />}
          disabled={draft.lines.length >= 200}
          onClick={() => onChange([...draft.lines, emptyInboundOrderLine()])}
        >
          Add item
        </Button>
      </div>
    </div>
  );
}

function LineRow({
  index,
  line,
  lineKey,
  action,
  identityMissing,
  quantityMissing,
  removable,
  onRemove,
  onChange,
}: {
  index: number;
  line: InboundOrderLine;
  lineKey: string;
  action: 'create' | 'update' | null;
  identityMissing: boolean;
  quantityMissing: boolean;
  removable: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<InboundOrderLine>) => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const search = useSkuCatalogSearch(debounced, { searchField: 'catalog', limit: 12 });
  const options = useMemo(() => {
    const rows = (search.data ?? []).map((item) => ({ value: item.id, label: item.product_title || item.sku, meta: item.sku, data: item }));
    if (line.skuCatalogId != null && !rows.some((r) => r.value === line.skuCatalogId)) {
      rows.unshift({ value: line.skuCatalogId, label: line.title || line.sku, meta: line.sku, data: undefined as never });
    }
    return rows;
  }, [search.data, line.skuCatalogId, line.title, line.sku]);
  const [costText, setCostText] = useState(() => centsToText(line.unitCostCents));

  return (
    <li className="flex flex-col gap-3 border-b border-border-hairline pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className={cn(RECORD_ID_CLASS, 'text-text-muted')}>{lineKey}</span>
        {action ? (
          <span className={cn('px-1.5 text-role-micro uppercase tracking-wide', TRIAGE_PANEL_INNER_CORNER, action === 'create' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
            {action === 'create' ? 'New line' : 'Updates existing line'}
          </span>
        ) : null}
        <span className="flex-1" />
        <IconButton icon={<Trash2 className="h-4 w-4" />} ariaLabel={`Remove item ${index + 1}`} disabled={!removable} onClick={onRemove} />
      </div>
      <FormField label="Catalog item">
        <SearchableSelectField
          value={line.skuCatalogId}
          onChange={(value, option) => {
            if (value == null) {
              onChange({ skuCatalogId: null });
              return;
            }
            const item = option?.data as { id: number; sku: string; product_title: string } | undefined;
            onChange({ skuCatalogId: Number(value), sku: item?.sku ?? line.sku, title: item?.product_title ?? line.title });
          }}
          options={options}
          filter={() => true}
          onSearchChange={setQuery}
          loading={search.isFetching}
          placeholder="Search the catalog by SKU or title"
          searchPlaceholder="SKU or title"
          emptyMessage={debounced.trim() ? 'No catalog item matches — type the SKU / title below' : 'Type to search'}
          ariaLabel={`Catalog item for line ${index + 1}`}
          className={cn(identityMissing && 'ring-1 ring-amber-400', TRIAGE_PANEL_INNER_CORNER)}
        />
      </FormField>
      <div className="grid grid-cols-[10rem_1fr_6rem_7rem] gap-2">
        <TextField label="SKU" value={line.sku} mono onChange={(sku) => onChange({ sku, skuCatalogId: sku === line.sku ? line.skuCatalogId : null })} aria-invalid={identityMissing || undefined} />
        <TextField label="Title" value={line.title} onChange={(title) => onChange({ title })} aria-invalid={identityMissing || undefined} />
        <TextField
          label="Qty *"
          value={line.quantity == null ? '' : String(line.quantity)}
          inputMode="numeric"
          aria-invalid={quantityMissing || undefined}
          onChange={(raw) => {
            const n = Number(raw.trim());
            onChange({ quantity: raw.trim() && Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : null });
          }}
        />
        <TextField
          label="Unit cost"
          value={costText}
          inputMode="decimal"
          onChange={(raw) => {
            setCostText(raw);
            const n = Number(raw.trim());
            onChange({ unitCostCents: raw.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null });
          }}
        />
      </div>
      <div className="grid grid-cols-[1fr_10rem_10rem] gap-2">
        <TextField label="Listing URL" value={line.listingUrl} type="url" onChange={(listingUrl) => onChange({ listingUrl })} />
        <TextField label="Item # / ASIN" value={line.itemNumber} mono onChange={(itemNumber) => onChange({ itemNumber })} />
        <TextField label="Source line id" value={line.lineKey} mono onChange={(lk) => onChange({ lineKey: lk })} />
      </div>
    </li>
  );
}
