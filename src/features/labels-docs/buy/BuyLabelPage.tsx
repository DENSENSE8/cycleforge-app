'use client';

/**
 * Buy a label — one ShipStation label, outright (owner 2026-09-28). No order
 * number is required; the page is only about this one label:
 *
 *   Ship to     the address (name, street, city, state, ZIP, country)
 *   Package     weight + L × W × H — or "Link a product" to fill them from the
 *               product's remembered parcel (and remember what you type here)
 *   Rates       carrier prices for exactly that package → pick one → Buy
 *   Bought      tracking, cost, the label as it prints, Print → the label station
 *
 * The bought label also lands on Labels & docs (a Labels card), so it prints
 * and reprints like every other label. ✕ (top right) or Esc goes back there.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Package, Printer, Truck, X } from '@/components/Icons';
import { BuyLabelSection } from '@/components/outbound/labels/BuyLabelSection';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, Checkbox, IconButton, TextField } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { usePrintStations } from '@/hooks/usePrintStations';
import { V1RequestError } from '@/lib/api/v1-client';
import type { LabelBuyProduct, LabelBuyPurpose, LabelBuyResult } from '@/lib/label-buys/contracts';
import { awaitingLabelsQuery } from '@/lib/queries/outbound-queries';
import { buyLabel, fetchLabelBuyRates, searchLabelBuyProducts } from '@/lib/label-buys/http-client';
import { labelPdfSrc } from '@/lib/label-prints/http-client';
import { rasterizeDocument } from '@/lib/label-prints/label-raster';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { SHIPPING_LABEL_PAPER } from '@/lib/label-prints/print-route';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { acknowledgeBuyerNote } from '@/lib/orders/buyer-note-ack-client';
import { BUYER_NOTE_HOLD_CODE } from '@/lib/orders/buyer-note-interlock';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { ShipAddress, ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { cn } from '@/utils/_cn';
import { stationFace } from '../PrintStationsCard';
import { useDeskPress } from '../use-desk-press';
import { usePrintRoutes } from '../use-print-routes';

const BACK_HREF = '/shipping/label-intake?view=labels';
const PURPOSE_TABS: { id: LabelBuyPurpose; label: string }[] = [
  { id: 'outbound', label: 'Outbound' },
  { id: 'return', label: 'Return' },
  { id: 'replacement', label: 'Replacement' },
];

interface AddressDraft {
  name: string;
  company: string;
  addressLine1: string;
  addressLine2: string;
  cityLocality: string;
  stateProvince: string;
  postalCode: string;
  countryCode: string;
  phone: string;
}
const EMPTY_ADDRESS: AddressDraft = {
  name: '',
  company: '',
  addressLine1: '',
  addressLine2: '',
  cityLocality: '',
  stateProvince: '',
  postalCode: '',
  countryCode: 'US',
  phone: '',
};

const num = (text: string): number | null => {
  const value = Number(text.trim());
  return text.trim() && Number.isFinite(value) && value > 0 ? value : null;
};
const numText = (value: number | null | undefined) => (value == null ? '' : String(value));
const money = (amount: number | null | undefined, currency = 'USD') =>
  amount == null ? '—' : `${currency === 'USD' ? '$' : `${currency} `}${amount.toFixed(2)}`;

function eta(rate: ShippingRateOption): string {
  if (typeof rate.deliveryDays === 'number' && rate.deliveryDays > 0) return `${rate.deliveryDays} day${rate.deliveryDays > 1 ? 's' : ''}`;
  if (rate.carrierDeliveryDays) return `${rate.carrierDeliveryDays} days`;
  return '';
}

/** The buyer-note hold a buy answered with, when the reference names an order with an unread note. */
function buyerNoteHold(error: unknown): { orderRowId: number; buyerNote: string } | null {
  if (!(error instanceof V1RequestError) || error.code !== BUYER_NOTE_HOLD_CODE) return null;
  const { orderRowId, buyerNote } = error.details;
  return typeof orderRowId === 'number' && typeof buyerNote === 'string' && buyerNote ? { orderRowId, buyerNote } : null;
}

function Section({ title, action, children, testId }: { title: string; action?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <RecordGroup title={title} action={action} testId={testId}>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1">{children}</div>
    </RecordGroup>
  );
}

/** "Link a product" — search the catalog; picking one fills the package from its remembered parcel. */
function ProductLink({ product, onPick }: { product: LabelBuyProduct | null; onPick: (next: LabelBuyProduct | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LabelBuyProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchLabelBuyProducts(q, controller.signal).then(
        (found) => {
          setResults(found);
          setError(null);
        },
        (failure: unknown) => {
          if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Product search failed.');
        },
      );
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  if (product) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-mode-control bg-surface-sunken px-3 py-2" data-testid="buy-product-linked">
        <Package className="size-4 shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm">
          {product.sku ? <span className="font-semibold">{product.sku} · </span> : null}
          {product.title}
        </span>
        <span className="shrink-0 text-xs text-text-muted">
          {product.parcel ? `Remembered from ${product.parcelSource === 'item_number' ? 'item #' : 'SKU'}` : 'No remembered size yet'}
        </span>
        <IconButton icon={<X className="size-3.5" />} ariaLabel="Unlink product" size="xs" radius="control" onClick={() => onPick(null)} />
      </div>
    );
  }
  if (!open) {
    return (
      <Button variant="secondary" size="sm" radius="control" icon={<Package />} onClick={() => setOpen(true)} data-testid="buy-link-product" className="self-start">
        Link a product
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <TextField label="Product SKU, title or item number" value={query} onChange={setQuery} autoFocus data-testid="buy-product-search" />
      {error ? <p className="text-role-caption text-text-danger">{error}</p> : null}
      <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        {results.map((item) => (
          <li key={item.skuCatalogId}>
            <button
              type="button"
              className={cn('flex w-full min-w-0 items-center gap-2 rounded-mode-control px-2 py-1.5 text-left hover:bg-surface-sunken', focusRing('control'))}
              onClick={() => {
                onPick(item);
                setOpen(false);
                setQuery('');
              }}
              data-testid="buy-product-option"
            >
              <span className="shrink-0 text-sm font-semibold tabular-nums">{item.sku ?? '—'}</span>
              <span className="min-w-0 flex-1 truncate text-role-caption">{item.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-text-muted">
                {item.parcel?.weightOz ? `${item.parcel.weightOz} oz` : ''}
                {item.parcel?.lengthIn ? ` · ${item.parcel.lengthIn}×${item.parcel.widthIn}×${item.parcel.heightIn} in` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" radius="control" className="self-start" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

function LabelPreview({ ingestionId }: { ingestionId: number }) {
  const [image, setImage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    rasterizeDocument(labelPdfSrc(ingestionId), SHIPPING_LABEL_PAPER).then(
      (pages) => live && setImage(pages[0] ?? null),
      (error: unknown) => live && setFailure(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      live = false;
    };
  }, [ingestionId]);
  return (
    // Square: a label is a sheet — rounding would clip its printed border.
    <div className="flex aspect-[4/6] w-full max-w-xs items-center justify-center overflow-hidden border border-border-hairline bg-surface-card" data-testid="buy-label-preview">
      {image ? <img src={image} alt="The bought label" className="h-full w-full object-contain" /> : <span className="text-role-caption text-text-muted">{failure ?? 'Rendering…'}</span>}
    </div>
  );
}

export function BuyLabelPage() {
  const router = useRouter();
  const stations = usePrintStations();
  const { refresh: refreshRoutes } = usePrintRoutes();
  const { print, notice } = useDeskPress(stations, refreshRoutes);
  const unlabeled = useQuery(awaitingLabelsQuery());
  const [orderId, setOrderId] = useState<number | null>(null);
  const [mode, setMode] = useState<'order' | 'manual'>('order');
  const picked = unlabeled.data?.find((order) => order.id === orderId) ?? null;
  const [address, setAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [product, setProduct] = useState<LabelBuyProduct | null>(null);
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [remember, setRemember] = useState(true);
  const [purpose, setPurpose] = useState<LabelBuyPurpose>('outbound');
  const [reference, setReference] = useState('');
  const [rateId, setRateId] = useState<string | null>(null);
  const [bought, setBought] = useState<LabelBuyResult | null>(null);
  const [buyNotice, setBuyNotice] = useState<string | null>(null);
  // One idempotency key per INTENDED purchase: a double press or a retry replays, never buys twice.
  const clientEventId = useRef(safeRandomUUID());

  const field = (key: keyof AddressDraft) => ({ value: address[key], onChange: (value: string) => setAddress((current) => ({ ...current, [key]: value })) });

  const pickProduct = (next: LabelBuyProduct | null) => {
    setProduct(next);
    if (next?.parcel) {
      setWeight(numText(next.parcel.weightOz));
      setLength(numText(next.parcel.lengthIn));
      setWidth(numText(next.parcel.widthIn));
      setHeight(numText(next.parcel.heightIn));
    }
  };

  const shipTo = useMemo<ShipAddress | null>(() => {
    const a = address;
    if (!a.name.trim() || !a.addressLine1.trim() || !a.cityLocality.trim() || !a.stateProvince.trim() || !a.postalCode.trim() || a.countryCode.trim().length !== 2) return null;
    return {
      name: a.name.trim(),
      company: a.company.trim() || null,
      phone: a.phone.trim() || null,
      addressLine1: a.addressLine1.trim(),
      addressLine2: a.addressLine2.trim() || null,
      cityLocality: a.cityLocality.trim(),
      stateProvince: a.stateProvince.trim(),
      postalCode: a.postalCode.trim(),
      countryCode: a.countryCode.trim().toUpperCase(),
    } as ShipAddress;
  }, [address]);
  const parcel = useMemo(() => {
    const w = num(weight);
    if (w == null) return null;
    const [l, wd, h] = [num(length), num(width), num(height)];
    return {
      weight: { value: w, unit: 'ounce' as const },
      dimensions: l != null && wd != null && h != null ? { length: l, width: wd, height: h, unit: 'inch' as const } : null,
    };
  }, [weight, length, width, height]);
  const missing = [!shipTo && 'the full ship-to address', !parcel && 'the weight'].filter(Boolean).join(' and ');

  // Rates belong to exactly the package + address they were asked for: any change clears them.
  const ratesKey = JSON.stringify({ shipTo, parcel, purpose });
  const rates = useMutation({ mutationFn: () => fetchLabelBuyRates({ purpose, shipTo: shipTo!, parcel: parcel! }) });
  const resetRates = rates.reset;
  useEffect(() => {
    resetRates();
    setRateId(null);
  }, [ratesKey, resetRates]);
  const options = useMemo(() => [...(rates.data?.rates ?? [])].sort((a, b) => a.amount - b.amount), [rates.data]);
  const chosen = options.find((rate) => rate.rateId === rateId) ?? null;

  const buyOnce = () =>
    buyLabel({
      purpose,
      shipTo: shipTo!,
      parcel: parcel!,
      clientEventId: clientEventId.current,
      rateId: chosen!.rateId,
      carrierId: chosen!.carrierId,
      serviceCode: chosen!.serviceCode,
      reference: reference.trim() || null,
      product: product ? { skuCatalogId: product.skuCatalogId, sku: product.sku } : null,
      rememberParcel: Boolean(product) && remember,
    });
  const buy = useMutation({
    mutationFn: async () => {
      try {
        return await buyOnce();
      } catch (error) {
        // The reference names an order with an unread buyer note: show it, record the ack, resend
        // with the SAME clientEventId (nothing was charged). Declining leaves the hold's message.
        const hold = buyerNoteHold(error);
        if (!hold || !(await acknowledgeBuyerNote(hold))) throw error;
        return buyOnce();
      }
    },
    onMutate: () => setBuyNotice(null),
    onSuccess: (result) => setBought(result),
    onError: (error) => {
      if (!(error instanceof V1RequestError) || error.code !== 'LABEL_PURCHASE_VOIDED') return;
      // This purchase's label was voided: its clientEventId is spent. Mint a new one and re-rate
      // (the old rate ids may be gone) so the next Buy is a new, deliberate purchase.
      clientEventId.current = safeRandomUUID();
      setRateId(null);
      setBuyNotice('That label was voided. Fresh rates below — pick one to buy a new label.');
      rates.mutate();
    },
  });

  const labelDoc = useMemo<DeskDocument | null>(
    () =>
      bought?.labelIngestionId
        ? {
            key: `label:${bought.labelIngestionId}`,
            kind: 'label',
            title: 'Shipping label',
            src: labelPdfSrc(bought.labelIngestionId),
            stock: 'label',
            ingestionId: bought.labelIngestionId,
            orderId: null,
            documentId: null,
            manualId: null,
          }
        : null,
    [bought],
  );

  const startOver = useCallback(() => {
    clientEventId.current = safeRandomUUID();
    setBought(null);
    setBuyNotice(null);
    buy.reset();
    rates.reset();
    setRateId(null);
    setAddress(EMPTY_ADDRESS);
    setReference('');
  }, [buy, rates]);

  const close = useCallback(() => router.push(BACK_HREF), [router]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const labelFace = stationFace(stations.target.label, 'label');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="buy-label-page">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border-hairline bg-surface-card px-6 py-3">
        <Truck className="size-5 text-text-muted" />
        <div className="min-w-0 flex-1">
          <h1 className="text-role-title text-text-default">Buy a label</h1>
          <p className="text-role-caption text-text-soft">Buy for an order that has no label, or type the address yourself. An item number is never required.</p>
        </div>
        <IconButton icon={<X className="size-4" />} ariaLabel="Close" title="Close (Esc)" size="sm" radius="control" onClick={close} data-testid="buy-label-close" />
      </header>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <TabSwitch
            tabs={[{ id: 'order', label: 'An order' }, { id: 'manual', label: 'Manual' }]}
            activeTab={mode}
            onTabChange={(id) => setMode(id as 'order' | 'manual')}
            size="sm"
            fit="fill"
          />
          {mode === 'order' ? (
          <Section title="Orders with no label" testId="buy-unlabeled">
            {unlabeled.isPending ? <p className="text-role-caption text-text-muted">Reading orders…</p> : null}
            {unlabeled.isError ? <p className="text-role-caption text-text-danger">Could not read orders with no label.</p> : null}
            {unlabeled.isSuccess && unlabeled.data.length === 0 ? (
              <p className="text-role-caption text-text-muted">Every open order already has a label.</p>
            ) : null}
            <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
              {(unlabeled.data ?? []).map((order) => {
                const selected = order.id === orderId;
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full min-w-0 items-center gap-2 rounded-mode-control px-2 py-1.5 text-left',
                        selected ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
                        focusRing('control'),
                      )}
                      onClick={() => setOrderId(order.id)}
                      data-testid="buy-unlabeled-order"
                    >
                      <span className="shrink-0 font-mono text-sm font-semibold">{order.order_id}</span>
                      <span className="min-w-0 flex-1 truncate text-role-caption">{order.product_title || order.sku}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {picked ? (
              <BuyLabelSection
                key={picked.id}
                orderId={picked.id}
                orderRef={picked.order_id}
                onChange={() => void unlabeled.refetch()}
                onPurchased={() => void unlabeled.refetch()}
              />
            ) : (
              <p className="text-role-caption text-text-muted">Pick an order to buy its label. No item number.</p>
            )}
          </Section>
          ) : (
          <>
          <Section title="Ship to" testId="buy-ship-to">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="Name" {...field('name')} autoFocus data-testid="buy-name" />
              <TextField label="Company (optional)" {...field('company')} />
              <TextField label="Street" {...field('addressLine1')} className="sm:col-span-2" data-testid="buy-street" />
              <TextField label="Apt, suite (optional)" {...field('addressLine2')} className="sm:col-span-2" />
              <TextField label="City" {...field('cityLocality')} data-testid="buy-city" />
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-3">
                <TextField label="State" {...field('stateProvince')} data-testid="buy-state" />
                <TextField label="ZIP" {...field('postalCode')} data-testid="buy-zip" />
                <TextField label="Country" {...field('countryCode')} maxLength={2} />
              </div>
              <TextField label="Phone (optional)" {...field('phone')} />
            </div>
          </Section>

          <Section title="Package" testId="buy-package">
            <ProductLink product={product} onPick={pickProduct} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TextField label="Weight (oz)" value={weight} onChange={setWeight} inputMode="decimal" data-testid="buy-weight" />
              <TextField label="Length (in)" value={length} onChange={setLength} inputMode="decimal" data-testid="buy-length" />
              <TextField label="Width (in)" value={width} onChange={setWidth} inputMode="decimal" data-testid="buy-width" />
              <TextField label="Height (in)" value={height} onChange={setHeight} inputMode="decimal" data-testid="buy-height" />
            </div>
            {product ? (
              <label className="flex items-center gap-2 text-role-caption text-text-default">
                <Checkbox checked={remember} onCheckedChange={(next) => setRemember(next === true)} />
                Remember this size and weight for {product.sku ?? 'this product'}
              </label>
            ) : null}
          </Section>
          </>
          )}
        </div>

        {mode === 'manual' ? (
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          {bought ? (
            <Section title="Label bought" testId="buy-result">
              <div className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-text-success" />
                <span className="font-semibold">{[bought.carrier, bought.service].filter(Boolean).join(' · ') || 'Label'}</span>
                <span className="ml-auto tabular-nums">{money(bought.cost, bought.currency ?? 'USD')}</span>
              </div>
              {bought.tracking ? <p className="font-mono text-role-caption text-text-default">{bought.tracking}</p> : null}
              {bought.warning ? <p className="text-role-caption text-text-warning">{bought.warning}</p> : null}
              {bought.labelIngestionId ? <LabelPreview ingestionId={bought.labelIngestionId} /> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ink"
                  size="sm"
                  radius="control"
                  icon={<Printer />}
                  loading={print.isPending}
                  disabled={!labelDoc}
                  onClick={() => labelDoc && print.mutate({ documents: [labelDoc], reprint: false })}
                  data-testid="buy-print"
                >
                  Print → {labelFace}
                </Button>
                <Button variant="secondary" size="sm" radius="control" onClick={startOver} data-testid="buy-another">
                  Buy another
                </Button>
                <Link href={BACK_HREF} className="text-role-caption text-text-accent underline-offset-2 hover:underline">
                  Open Labels
                </Link>
              </div>
              {notice ? <p className="text-role-caption text-text-muted">{notice}</p> : null}
            </Section>
          ) : (
            <Section title="Service" testId="buy-service">
              <TabSwitch tabs={PURPOSE_TABS} activeTab={purpose} onTabChange={(id) => setPurpose(id as LabelBuyPurpose)} size="sm" fit="fill" />
              <TextField label="Reference (optional) — order #, RMA, note" value={reference} onChange={setReference} maxLength={64} data-testid="buy-reference" />
              <Button
                variant="secondary"
                size="sm"
                radius="control"
                icon={<Truck />}
                loading={rates.isPending}
                disabled={Boolean(missing)}
                onClick={() => rates.mutate()}
                data-testid="buy-get-rates"
              >
                Get rates
              </Button>
              {missing ? <p className="text-role-caption text-text-muted">Add {missing} to see rates.</p> : null}
              {rates.isError ? <p className="text-role-caption text-text-danger" data-testid="buy-rates-error">{rates.error.message}</p> : null}
              {rates.data && options.length === 0 ? (
                <p className="text-role-caption text-text-muted">No carrier returned a rate for this package.</p>
              ) : null}
              {options.length > 0 ? (
                <ul role="radiogroup" aria-label="Rates" className="flex flex-col gap-1" data-testid="buy-rates">
                  {options.map((rate) => (
                    <li key={rate.rateId}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={rate.rateId === rateId}
                        onClick={() => setRateId(rate.rateId)}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 rounded-mode-control px-3 py-2 text-left ring-1 ring-inset',
                          rate.rateId === rateId ? 'ring-2 ring-fill-info' : 'ring-border-hairline hover:bg-surface-sunken',
                          focusRing('control'),
                        )}
                        data-testid="buy-rate"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{rate.serviceName}</span>
                          <span className="block truncate text-xs text-text-muted">{[rate.carrierName, eta(rate)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{money(rate.amount + (rate.otherAmount ?? 0), rate.currency)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {chosen ? (
                <Button variant="ink" size="md" radius="control" icon={<Truck />} loading={buy.isPending} onClick={() => buy.mutate()} data-testid="buy-submit">
                  Buy {chosen.carrierName} {money(chosen.amount + (chosen.otherAmount ?? 0), chosen.currency)}
                </Button>
              ) : null}
              {buyNotice ? <p className="text-role-caption text-text-warning" data-testid="buy-notice">{buyNotice}</p> : null}
              {buy.isError && !buyNotice ? <p className="text-role-caption text-text-danger" data-testid="buy-error">{buy.error.message}</p> : null}
            </Section>
          )}
        </div>
        ) : null}
      </div>
    </div>
  );
}
