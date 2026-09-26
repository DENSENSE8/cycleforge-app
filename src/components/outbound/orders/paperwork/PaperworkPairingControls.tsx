'use client';

/** Pairing controls for the paperwork card ({@link PaperworkDocuments}): */

import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TYPE_OPTIONS } from '@/components/manuals/manual-crud/manual-crud-shared';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Button, Checkbox } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  TRIAGE_PANEL_INNER_CORNER,
  TRIAGE_PANEL_SEGMENT_ENDS,
  triagePanelControl,
} from '@/design-system/tokens/triage-panel';
import type { PaperworkSource } from '@/lib/manuals/paperwork-pairing';
import { cn } from '@/utils/_cn';
import type { OrderManual, OrderManualsResponse } from '@/lib/orders/order-paperwork-client';

export const CAPTION = 'text-role-caption text-text-muted';

/** The library's paperwork types (product_manuals.type), minus "unspecified". */
const PAPERWORK_TYPES = TYPE_OPTIONS.filter((option) => option.value);

/** What a pairing key reaches — the group caption and the pair-to hint. */
const SOURCE_REACH: Record<PaperworkSource, string> = {
  order: 'Only this order',
  item_number: 'Every order of this item number',
  sku: 'Every order of this SKU',
};

export type PaperworkPatch = {
  displayName?: string;
  type?: string | null;
  pairing?: Pick<OrderManual['pairing'], 'orderId' | 'itemNumber' | 'sku'>;
};

export const FIELD_CLASS = cn(
  'min-w-0 flex-1 border border-border-default bg-surface-card px-3 text-role-data text-text-default',
  triagePanelControl(),
  focusRing('control'),
);

/** One pairing source's heading in the grouped list. */
export function GroupHeader({
  source,
  orderRef,
  itemNumber,
  sku,
  onOpenItemView,
}: {
  source: PaperworkSource;
  orderRef: string;
  itemNumber: string | null;
  sku: string | null;
  onOpenItemView?: () => void;
}) {
  const face =
    source === 'order' ? (
      <>This order <span className="font-mono">{orderRef}</span></>
    ) : source === 'item_number' ? (
      <>Item # <span className="font-mono">{itemNumber ?? '—'}</span></>
    ) : (
      <>SKU <span className="font-mono">{sku ?? '—'}</span></>
    );
  return (
    <div className="flex items-center gap-2 border-b border-border-hairline pb-1">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words text-role-caption font-semibold text-text-default">{face}</span>
        <span className={CAPTION}>{SOURCE_REACH[source]}</span>
      </span>
      {source === 'item_number' && onOpenItemView ? (
        <Button
          variant="ghost"
          size="sm"
          className={TRIAGE_PANEL_INNER_CORNER}
          data-testid="paperwork-group-open-item-view"
          onClick={onOpenItemView}
        >
          Item view
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Re-pair one row: the complete new pinning. Every key kept resolves it; the
 * row may leave this order entirely (it then drops off this list). A pin to
 * some other order is kept unless cleared from that order.
 */
export function RepairForm({
  manual,
  orderId,
  orderRef,
  onSave,
  onCancel,
}: {
  manual: OrderManual;
  orderId: number;
  orderRef: string;
  onSave: (patch: PaperworkPatch) => void;
  onCancel: () => void;
}) {
  const { pairing } = manual;
  const otherOrderId = pairing.orderId != null && pairing.orderId !== orderId ? pairing.orderId : null;
  const [pinOrder, setPinOrder] = useState(pairing.orderId === orderId);
  const [itemNumber, setItemNumber] = useState(pairing.itemNumber ?? '');
  const [sku, setSku] = useState(pairing.sku ?? '');
  const [type, setType] = useState(manual.type || 'manual');
  const nothing = !pinOrder && otherOrderId == null && !itemNumber.trim() && !sku.trim();

  return (
    <form
      data-testid="paperwork-repair-form"
      className="flex flex-col gap-2 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (nothing) return;
        onSave({
          type,
          pairing: {
            orderId: pinOrder ? orderId : otherOrderId,
            itemNumber: itemNumber.trim() || null,
            sku: sku.trim() || null,
          },
        });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <p className="break-words text-role-data font-semibold text-text-default">{manual.displayName}</p>
      <label className="flex items-center gap-2 text-role-data text-text-default">
        <Checkbox
          checked={pinOrder}
          onCheckedChange={(next) => setPinOrder(next === true)}
          data-testid="paperwork-repair-order"
        />
        This order <span className="font-mono">{orderRef}</span>
      </label>
      {otherOrderId != null ? <p className={CAPTION}>Also pinned to another order — kept.</p> : null}
      <label className="flex items-center gap-2">
        <span className={cn(CAPTION, 'w-12 shrink-0')}>Item #</span>
        <input
          aria-label="Item number"
          data-testid="paperwork-repair-item"
          value={itemNumber}
          onChange={(event) => setItemNumber(event.target.value)}
          className={cn(FIELD_CLASS, 'font-mono')}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className={cn(CAPTION, 'w-12 shrink-0')}>SKU</span>
        <input
          aria-label="SKU"
          data-testid="paperwork-repair-sku"
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          className={cn(FIELD_CLASS, 'font-mono')}
        />
      </label>
      <Segmented
        label="Paperwork type"
        testId="paperwork-repair-type"
        value={type}
        onChange={setType}
        options={PAPERWORK_TYPES}
      />
      {nothing ? (
        <p className="text-role-caption text-text-warning">Nothing kept — use Unpair to take it off everywhere.</p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="md" className={triagePanelControl()} disabled={nothing} data-testid="paperwork-repair-save">
          Save
        </Button>
        <Button type="button" variant="ghost" size="md" className={triagePanelControl()} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A one-of-N choice in the triage segment face (the kind tabs' twin). */
function Segmented<T extends string>({
  label,
  testId,
  value,
  onChange,
  options,
}: {
  label: string;
  testId: string;
  value: T;
  onChange?: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; disabled?: boolean }>;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className={cn('inline-flex max-w-full flex-wrap self-start border border-border-soft', TRIAGE_PANEL_SEGMENT_ENDS)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-value={option.value}
          disabled={option.disabled || !onChange}
          onClick={() => onChange?.(option.value)}
          className={cn(
            'ds-raw-button inline-flex h-9 items-center gap-1 border-l border-border-soft px-3 text-role-caption font-semibold first:border-l-0 disabled:cursor-not-allowed',
            value === option.value
              ? 'bg-surface-inverse text-text-inverse'
              : 'bg-surface-card text-text-default hover:bg-surface-sunken disabled:text-text-faint disabled:hover:bg-surface-card',
            focusRing('control'),
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Where new paired paperwork pins, its type, and pairing from the library. */
export function PairingControls({
  resolved,
  scope,
  onScope,
  type,
  onType,
  pairedIds,
  pending,
  onPair,
  onOpenItemView,
}: {
  resolved: OrderManualsResponse | null;
  scope: PaperworkSource;
  /** Absent in the item view — the scope is the item number. */
  onScope?: (scope: PaperworkSource) => void;
  type: string;
  onType: (type: string) => void;
  pairedIds: readonly number[];
  pending: boolean;
  /**
   * Absent in the item view: the library list portals under a modal dialog
   * (pointer-locked, focus-trapped), so library pairing lives in the walk.
   */
  onPair?: (manualId: number) => void;
  onOpenItemView?: () => void;
}) {
  const itemNumber = resolved?.itemNumber ?? null;
  const sku = resolved?.sku ?? null;

  return (
    <div className="flex flex-col gap-2" data-testid="paperwork-manual-pairing">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(CAPTION, 'w-14 shrink-0')}>Pair to</span>
        <Segmented
          label="Pair new paperwork to"
          testId="paperwork-pair-scope"
          value={scope}
          onChange={onScope}
          options={[
            { value: 'order', label: 'This order' },
            {
              value: 'item_number',
              label: <>Item # <span className="font-mono">{itemNumber ?? '—'}</span></>,
              disabled: !itemNumber,
            },
            { value: 'sku', label: <>SKU <span className="font-mono">{sku ?? '—'}</span></>, disabled: !sku },
          ]}
        />
        {onOpenItemView ? (
          <Button
            variant="ghost"
            size="md"
            className={triagePanelControl()}
            data-testid="paperwork-open-item-view"
            onClick={onOpenItemView}
          >
            Item # view
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(CAPTION, 'w-14 shrink-0')}>Type</span>
        <Segmented label="Paperwork type" testId="paperwork-type" value={type} onChange={onType} options={PAPERWORK_TYPES} />
      </div>
      <p className={CAPTION}>{SOURCE_REACH[scope]} shows it here and pack prints it with the label and slip.</p>
      {onPair ? <LibraryPairPicker pairedIds={pairedIds} pending={pending} onPair={onPair} /> : null}
    </div>
  );
}

/** Pair a row already in the library (manuals library search). */
function LibraryPairPicker({
  pairedIds,
  pending,
  onPair,
}: {
  pairedIds: readonly number[];
  pending: boolean;
  onPair: (manualId: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const library = useQuery({
    queryKey: ['paperwork-manual-library', debounced],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debounced, limit: '30' });
      const res = await fetch(`/api/product-manuals/search?${params}`, { credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as {
        manuals?: Array<{ id: number; display_name: string | null; product_title: string | null; item_number: string | null; type: string | null }>;
      };
      return body.manuals ?? [];
    },
    staleTime: 60_000,
  });

  const options = (library.data ?? [])
    .filter((m) => !pairedIds.includes(m.id))
    .map((m) => ({
      value: m.id,
      label: m.display_name || m.product_title || `Manual #${m.id}`,
      meta: [m.item_number ? `Item ${m.item_number}` : null, m.type].filter(Boolean).join(' · ') || undefined,
    }));

  return (
    <div className={cn('border border-border-default bg-surface-card', triagePanelControl())}>
      <SearchableSelectField
        value={null}
        onChange={(next) => {
          if (next == null) return;
          onPair(Number(next));
        }}
        options={options}
        onSearchChange={setQuery}
        loading={library.isFetching}
        disabled={pending}
        appearance="flush"
        placeholder={pending ? 'Pairing…' : 'Pair one from the library…'}
        searchPlaceholder="Name or item #…"
        emptyMessage="Nothing matching in the library"
        ariaLabel="Pair paperwork from the library"
        testId="paperwork-manual-pair"
        className="h-full w-full"
      />
    </div>
  );
}
