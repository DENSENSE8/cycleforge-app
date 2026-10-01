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
import { CopyChip } from '@/components/ui/CopyChip';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { ItemIdentityRow, SkuOpenInMenu } from '@/design-system/components/record-ledger/RecordItemIdentity';
import { Button, OmnichannelComposerDock } from '@/design-system/primitives';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { useAuth } from '@/contexts/AuthContext';
import { useStockPlaceOptions } from '@/hooks/useStockPlaceOptions';
import { commitStockRequest, stockSetRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { createTempSku, createTempStockAtLocation } from '@/lib/inventory/create-temp-stock-at-location';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { searchProducts } from '@/lib/orders/intake/intake-product-client';
import type { IntakeProductHit } from '@/lib/orders/intake-product-search';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { StockItemCard } from './StockItemCard';
import { StockQtySlider } from '@/design-system/components/StockQtySlider';
import { stockLocationFace } from './stock-record';

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const SEARCH_DEBOUNCE_MS = 200;

const FIELD_CLASS = cn(
  'h-11 rounded-mode-control border border-border-default bg-surface-card px-3 text-sm text-text-default',
  focusRing('control'),
);
const LABEL_CLASS = 'text-xs font-medium text-text-muted';
const RECORD_FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';


export function StockAddForm({
  rows,
  onAdded,
  onClose,
  record = null,
  initialBarcode = record?.location_barcode ?? null,
}: {
  /** The loaded pairs — what the bin holds now, so "Current stock" writes the difference. */
  rows: readonly LocationStockTableRow[];
  /** Stock landed — re-read the loader. */
  onAdded: (sku?: string) => void;
  onClose: () => void;
  /** An empty triage location can open this form with its location already selected. */
  initialBarcode?: string | null;
  /** Empty location record: paint the populated record layout with blank item data. */
  record?: LocationStockTableRow | null;
}) {
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  // The phone reads the record's verbs at the 44px touch rung.
  const { isMobile } = useUIModeOptional();
  const verbSize = isMobile ? 'lg' : 'sm';
  const places = useStockPlaceOptions();
  const [title, setTitle] = useState('');
  const [product, setProduct] = useState<IntakeProductHit | null>(null);
  const [hits, setHits] = useState<IntakeProductHit[]>([]);
  const [barcode, setBarcode] = useState<string | null>(initialBarcode);
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
    (product != null || (!record && titleLength >= TITLE_MIN && titleLength <= TITLE_MAX));
  const tempReady = !busy && record?.source === 'empty' && barcode != null && titleLength <= TITLE_MAX;
  const missing = busy
    ? null
    : record && !product
      ? 'Pair Zoho SKU'
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
        sku = (await createTempSku({ productTitle: title.trim(), description: note ?? null, sourceRef })).sku;
        setSourceRef(safeRandomUUID());
      }
      // A tote that never held stock becomes a stock place here.
      const target = await places.resolve(barcode);
      await commitStockRequest(
        stockSetRequest(
          { rowId: `${target}:${sku}`, barcode: target, sku, qty: existing, face: `${binFace} · ${sku}` },
          qty,
          { staffId, reason: existing === 0 ? 'BIN_ADD' : 'MANUAL_COUNT', notes: note },
        ),
      );
      toast.success(`${binFace} · ${sku}: ${existing} → ${qty}${product ? '' : ' (new product)'}`);
      setProduct(null);
      setTitle('');
      setQtyDraft('');
      setDescription('');
      onAdded(sku);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add stock.');
    } finally {
      setBusy(false);
    }
  };

  const createTempForPhotos = async () => {
    if (!tempReady || barcode == null) return;
    setBusy(true);
    try {
      const item = await createTempStockAtLocation({
        productTitle: title.trim() || `Item at ${binFace ?? barcode}`,
        description: description.trim() || null,
        sourceRef,
        barcode,
        staffId,
      });
      setSourceRef(safeRandomUUID());
      toast.success(`${item.sku} created at ${binFace ?? barcode} for photos`);
      onAdded(item.sku);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the temporary SKU.');
    } finally {
      setBusy(false);
    }
  };

  const catalogHits = hits.length > 0 ? (
    <ul
      className={cn(
        'overflow-hidden rounded-mode-control border border-border-default bg-surface-card shadow-elev-raised',
        record ? 'mt-2' : 'absolute left-0 right-0 top-full z-30 mt-1',
      )}
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
      <li className="border-t border-border-soft px-3 py-1.5 text-xs text-text-muted">
        Not listed? Keep typing — it is added as a new product.
      </li>
    </ul>
  ) : null;

  if (record) {
    const face = stockLocationFace(record);
    const sliderQty = Number.isFinite(qty) && qty >= 0 ? qty : 0;
    const itemTitle = product?.title ?? 'Product title —';
    const titleContent = (
      <p
        className={cn(
          'line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]',
          product ? 'text-text-default' : 'text-text-faint',
        )}
        title={itemTitle}
        data-testid="stock-record-item-title"
      >
        {itemTitle}
      </p>
    );
    const pairingRow = (
      <div className="px-4 pb-3">
        <ItemIdentityRow
          label="SKU"
          actions={
            product ? (
              <>
                <SkuOpenInMenu sku={product.sku} />
                <button
                  type="button"
                  onClick={unpick}
                  aria-label="Unpair product"
                  className={cn('ds-raw-button shrink-0 text-text-muted hover:text-text-default', focusRing('control'))}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </>
            ) : null
          }
          testId="stock-zoho-sku-row"
        >
          {product ? (
            <CopyChip value={product.sku} display={product.sku} tone="sku" fitDisplayWidth />
          ) : (
            <label className="min-w-0 flex-1">
              <span className="sr-only">Pair Zoho SKU</span>
              <input
                value={title}
                maxLength={TITLE_MAX}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Pair Zoho SKU"
                className={cn(
                  'w-full rounded-mode-control border border-border-default bg-surface-card px-2 text-sm font-medium text-text-default placeholder:text-text-faint',
                  isMobile ? 'h-11 text-base' : 'h-8',
                  focusRing('control'),
                )}
                data-testid="stock-add-title"
              />
            </label>
          )}
        </ItemIdentityRow>
        {product ? null : catalogHits}
      </div>
    );

    return (
      <div
        className="flex-1 bg-mode-canvas p-4 text-mode-ink"
        data-testid="stock-evidence"
        aria-label="Add stock"
        role="group"
      >
        <DeskRecordLayout
          main={
            <div className="flex min-w-0 flex-col gap-4" data-testid="stock-add-form">
              <RecordGroup title="Item" titleHidden>
                <StockItemCard
                  record={record}
                  titleContent={titleContent}
                  showSku={false}
                  photoTitle={(product?.title ?? title.trim()) || 'Add SKU'}
                />
              </RecordGroup>
              <RecordGroup
                title="Zoho SKU"
                testId="stock-zoho-sku"
                action={
                  record.source === 'empty' ? (
                    <Button
                      variant="secondary"
                      size={verbSize}
                      disabled={!tempReady}
                      loading={busy}
                      onClick={() => void createTempForPhotos()}
                      data-testid="stock-create-temp-sku"
                    >
                      Create TMP SKU
                    </Button>
                  ) : undefined
                }
              >
                {pairingRow}
              </RecordGroup>
              <RecordGroup
                title="Locations"
                testId="stock-locations"
                titleAccessory={
                  <span className="text-role-caption tabular-nums text-mode-muted">
                    0 on hand · 1 place
                  </span>
                }
              >
                <div className="flex flex-col px-4 pb-3">
                  <div className="flex flex-col gap-1.5 py-2" data-testid={`stock-location-${record.location_barcode ?? 'empty'}`}>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <p className={cn(RECORD_ID_CLASS, 'truncate text-mode-ink')}>{face ?? 'No location'}</p>
                        {record.room ? <p className="truncate text-role-caption text-mode-muted">{record.room}</p> : null}
                      </div>
                      <span className={cn(RECORD_ID_CLASS, 'text-right text-mode-ink')} data-testid="stock-location-qty">
                        0
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <StockQtySlider
                        value={sliderQty}
                        onChange={(next) => setQtyDraft(String(next))}
                        min={0}
                        anchor={0}
                        ariaLabel={`Count at ${face ?? 'this location'}`}
                        disabled={busy}
                        testId={`stock-location-count-${record.location_barcode ?? 'empty'}`}
                      />
                      <Button
                        variant={ready ? 'ink' : 'secondary'}
                        size={verbSize}
                        disabled={!ready}
                        loading={busy}
                        onClick={() => void add()}
                        data-testid="stock-add-location-submit"
                      >
                        {sliderQty > 0 ? `Add ${sliderQty}` : 'Add'}
                      </Button>
                    </div>
                    <span className="text-role-caption text-mode-muted" role="status" data-testid="stock-add-preview">
                      {missing ?? `${product ? product.sku : 'New product'} at ${face}: 0 → ${qty}`}
                    </span>
                  </div>
                </div>
              </RecordGroup>
            </div>
          }
          aside={
            <div className="flex min-w-0 flex-col gap-4">
              <RecordGroup title="Send to staff" testId="stock-record-send">
                <p className="px-4 py-3 text-role-caption text-mode-muted">Choose a SKU first.</p>
              </RecordGroup>
              <RecordGroup title="Movement" testId="stock-record-location">
                <div className={RECORD_FACTS_BODY_CLASS}>
                  <EvidenceFactRow label="Last moved">—</EvidenceFactRow>
                  <EvidenceFactRow label="Counted">Never</EvidenceFactRow>
                </div>
              </RecordGroup>
            </div>
          }
        />
      </div>
    );
  }

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
          {catalogHits}
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
