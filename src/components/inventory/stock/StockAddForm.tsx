'use client';

/**
 * Inventory › Stock — **Add stock**, inline above the list, four facts:
 * **Title** · **Location** · **Current stock**, then the **Description**
 * composer at the bottom (drag its corner to resize; its button adds).
 *
 * The title is also the pairing: typing searches the catalog and a pick pairs
 * the stock to that product. No pick = a product the catalog does not know,
 * so the add mints a placeholder (`TMP-`, `POST /api/sku-catalog/provisional`)
 * with that title and description — one form, no separate New temp SKU.
 * "Current stock" is what the tote/bin holds now: the form writes the
 * difference as one `put` (reason `BIN_ADD`) or `take` (`CYCLE_COUNT_ADJ`).
 * Location lists totes (`H-…`) and barcoded bins (`useStockPlaceOptions`).
 */

import { useEffect, useState } from 'react';
import { X } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Button, OmnichannelComposerDock } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { useStockPlaceOptions } from './useStockPlaceOptions';
import { commitStockRequest, stockAdjustRequest } from '@/lib/inventory/stock-bin-verb-writes';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { searchProducts } from '@/lib/orders/intake/intake-product-client';
import type { IntakeProductHit } from '@/lib/orders/intake-product-search';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const SEARCH_DEBOUNCE_MS = 200;

const FIELD_CLASS = cn(
  'h-11 rounded-mode-control border border-border-default bg-surface-card px-3 text-sm text-text-default',
  focusRing('control'),
);
const LABEL_CLASS = 'text-xs font-medium text-text-muted';

/** Mint a placeholder for a product the catalog does not know. */
async function createPlaceholder(body: { productTitle: string; description: string | null; sourceRef: string }): Promise<ProvisionalSku> {
  const res = await fetch('/api/sku-catalog/provisional', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string; item?: ProvisionalSku } | null;
  if (!res.ok || !data?.success || !data.item) throw new Error(data?.error || `Could not create the product (${res.status})`);
  return data.item;
}

export function StockAddForm({
  rows,
  onAdded,
  onClose,
}: {
  /** The loaded pairs — what the bin holds now, so "Current stock" writes the difference. */
  rows: readonly LocationStockTableRow[];
  /** Stock landed — re-read the loader. */
  onAdded: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  const places = useStockPlaceOptions();
  const [title, setTitle] = useState('');
  const [product, setProduct] = useState<IntakeProductHit | null>(null);
  const [hits, setHits] = useState<IntakeProductHit[]>([]);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [description, setDescription] = useState('');
  const [sourceRef, setSourceRef] = useState(safeRandomUUID);
  const [busy, setBusy] = useState(false);

  // The title searches the catalog until a product is picked.
  const query = product ? '' : title.trim();
  useEffect(() => {
    if (query.length < TITLE_MIN) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      searchProducts(query, ctrl.signal)
        .then((next) => setHits(next.slice(0, 5)))
        .catch(() => {});
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const qty = Number.parseInt(qtyDraft, 10);
  const titleLength = title.trim().length;
  const existing =
    product && barcode
      ? (rows.find((row) => row.source === 'bin' && row.location_barcode === barcode && row.sku === product.sku)?.qty ?? 0)
      : 0;
  const binFace = barcode ? places.faceOf(barcode) : null;
  const ready =
    !busy &&
    barcode != null &&
    Number.isFinite(qty) &&
    qty >= 0 &&
    qty !== existing &&
    (product != null || (titleLength >= TITLE_MIN && titleLength <= TITLE_MAX));
  const missing = busy
    ? null
    : !product && titleLength < TITLE_MIN
      ? 'Title — pick a product or name a new one'
      : barcode == null
        ? 'Location'
        : !Number.isFinite(qty) || qty < 0
          ? 'Current stock'
          : qty === existing
            ? `Already ${existing} at ${binFace}`
            : null;

  const pick = (hit: IntakeProductHit) => {
    setProduct(hit);
    setTitle(hit.title);
    setHits([]);
  };
  const unpick = () => {
    setProduct(null);
    setTitle('');
  };

  const add = async () => {
    if (!ready || barcode == null) return;
    setBusy(true);
    try {
      const note = description.trim() || undefined;
      let sku = product?.sku ?? null;
      if (!sku) {
        sku = (await createPlaceholder({ productTitle: title.trim(), description: note ?? null, sourceRef })).sku;
        setSourceRef(safeRandomUUID());
      }
      const delta = qty - existing;
      // A tote that never held stock becomes a stock place here.
      const target = await places.resolve(barcode);
      await commitStockRequest(
        stockAdjustRequest(
          { rowId: `${target}:${sku}`, barcode: target, sku, qty: existing, face: `${binFace} · ${sku}` },
          delta > 0
            ? { direction: 'in', qty: delta, staffId, reasonCode: 'BIN_ADD', notes: product ? note : undefined }
            : { direction: 'out', qty: -delta, staffId, reasonCode: 'CYCLE_COUNT_ADJ', notes: note },
        ),
      );
      toast.success(`${binFace} · ${sku}: ${existing} → ${qty}${product ? '' : ' (new product)'}`);
      setProduct(null);
      setTitle('');
      setQtyDraft('');
      setDescription('');
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add stock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border-soft px-4 pb-3 pt-1" data-testid="stock-add-form" aria-label="Add stock" role="group">
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative flex min-w-64 flex-[2] flex-col gap-1">
          <span className={LABEL_CLASS}>Title</span>
          {product ? (
            <span className={cn(FIELD_CLASS, 'flex items-center gap-2')} data-testid="stock-add-product">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{product.title}</span>{' '}
                <span className="font-mono text-xs text-text-muted">{product.sku}</span>
              </span>
              <button
                type="button"
                onClick={unpick}
                aria-label="Unpair product"
                className={cn('ds-raw-button shrink-0 text-text-muted hover:text-text-default', focusRing('control'))}
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          ) : (
            <input
              value={title}
              maxLength={TITLE_MAX}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Search the catalog, or name a new product"
              className={FIELD_CLASS}
              data-testid="stock-add-title"
            />
          )}
          {hits.length > 0 ? (
            <ul
              className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-mode-control border border-border-default bg-surface-card shadow-elev-raised"
              data-testid="stock-add-hits"
            >
              {hits.map((hit) => (
                <li key={hit.skuCatalogId}>
                  <button
                    type="button"
                    onClick={() => pick(hit)}
                    className={cn('ds-raw-button flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-sunken', focusRing('control'))}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-text-default">{hit.title}</span>
                    <span className="shrink-0 font-mono text-xs text-text-muted">{hit.sku}</span>
                  </button>
                </li>
              ))}
              <li className="border-t border-border-soft px-3 py-1.5 text-xs text-text-muted">Not listed? Keep typing — it is added as a new product.</li>
            </ul>
          ) : null}
        </label>
        <label className="flex min-w-44 flex-1 flex-col gap-1">
          <span className={LABEL_CLASS}>Location</span>
          <SearchableSelectField
            value={barcode}
            onChange={(next) => setBarcode(next == null ? null : String(next))}
            options={places.options}
            loading={places.loading}
            placeholder="Tote or bin"
            searchPlaceholder="Tote (H-12), bin code or room…"
            emptyMessage="No matching location"
            ariaLabel="Location"
            className="h-11 rounded-mode-control px-3 text-sm"
            testId="stock-add-location"
          />
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className={LABEL_CLASS}>Current stock</span>
          <input
            value={qtyDraft}
            onChange={(event) => setQtyDraft(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder={product && barcode ? String(existing) : '0'}
            aria-label="Current stock"
            className={cn(FIELD_CLASS, 'text-center tabular-nums')}
            data-testid="stock-add-qty"
          />
        </label>
        <Button type="button" variant="ghost" size="md" onClick={onClose} data-testid="stock-add-close">
          Done
        </Button>
      </div>
      <OmnichannelComposerDock
        value={description}
        onChange={setDescription}
        onCommit={() => void add()}
        placeholder="Description — condition, markings, what's in the box (optional)"
        ariaLabel="Description"
        manualResize
        manualResizeMinPx={56}
        commitGlyph="action"
        commitLabel={busy ? 'Adding…' : 'Add stock'}
        commitDisabled={!ready}
        footerStart={
          <span className="text-xs tabular-nums text-text-muted" role="status" data-testid="stock-add-preview">
            {missing ?? `${product ? product.sku : 'New product'} at ${binFace}: ${existing} → ${qty}`}
          </span>
        }
        animateMount={false}
      />
    </div>
  );
}
