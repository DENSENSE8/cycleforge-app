'use client';

/**
 * Buy a label — the Labels desk's OWN compose record (owner 2026-10-01,
 * replaces the `/shipping/buy-label` focus page). The rail stays the labels
 * display; this card is the record: pick an order with no label, or type the
 * address. The rate-shop → purchase is `BuyLabelSection` — order-bound or its
 * MANUAL source (`/api/v1/label-buys`) — so ONE buy flow serves every mount.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, X } from '@/components/Icons';
import { BuyLabelSection, type LabelBuyManualSource } from '@/components/outbound/labels/BuyLabelSection';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, Checkbox, IconButton, TextField } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { searchLabelBuyProducts } from '@/lib/label-buys/http-client';
import type { LabelBuyProduct } from '@/lib/label-buys/contracts';
import type { ShipAddress } from '@/lib/shipping/shipstation/types';
import { awaitingLabelsQuery } from '@/lib/queries/outbound-queries';
import { cn } from '@/utils/_cn';

interface AddressDraft {
  name: string;
  company: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  cityLocality: string;
  stateProvince: string;
  postalCode: string;
  countryCode: string;
}

const EMPTY_ADDRESS: AddressDraft = {
  name: '',
  company: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  cityLocality: '',
  stateProvince: '',
  postalCode: '',
  countryCode: 'US',
};

const num = (text: string): number | null => {
  const parsed = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const numText = (value: number | null | undefined) => (value == null ? '' : String(value));

/** "Link a product" — search the catalog; picking one fills the package from its remembered parcel. */
function ProductLink({ product, onPick }: { product: LabelBuyProduct | null; onPick: (next: LabelBuyProduct | null) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const search = useQuery({
    queryKey: ['label-buy-products', query],
    enabled: open && query.trim().length >= 2,
    queryFn: ({ signal }) => searchLabelBuyProducts(query, signal),
  });
  return (
    <div className="relative" data-testid="label-buy-product-link">
      {product ? (
        <div className="flex items-center gap-2 rounded-mode-control border border-border-soft bg-surface-card px-2.5 py-1.5">
          <Package className="size-3.5 shrink-0 text-text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-role-caption text-text-default" title={product.title}>
            {product.sku ? <span className="font-mono font-semibold">{product.sku} · </span> : null}
            {product.title}
          </span>
          <IconButton
            icon={<X className="size-3.5" />}
            ariaLabel="Clear product"
            size="xs"
            radius="pill"
            tone="neutral"
            onClick={() => onPick(null)}
            data-testid="label-buy-product-clear"
          />
        </div>
      ) : (
        <TextField
          label="Link a product (fills the package)"
          value={query}
          onChange={(next) => {
            setQuery(next);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="SKU or title — at least 2 characters"
          data-testid="label-buy-product-search"
        />
      )}
      {open && !product && query.trim().length >= 2 ? (
        <div className="absolute inset-x-0 top-full z-raised mt-1 max-h-56 overflow-y-auto rounded-mode-control border border-border-soft bg-surface-card shadow-elev">
          {search.isFetching ? <p className="px-2.5 py-2 text-role-caption text-text-muted">Searching…</p> : null}
          {search.isError ? <p className="px-2.5 py-2 text-role-caption text-text-danger">{search.error.message}</p> : null}
          {search.data?.length === 0 ? <p className="px-2.5 py-2 text-role-caption text-text-muted">No product matches.</p> : null}
          {(search.data ?? []).map((hit) => (
            <button
              key={`${hit.skuCatalogId}:${hit.sku ?? ''}`}
              type="button"
              className={cn('flex w-full min-w-0 items-baseline gap-2 px-2.5 py-1.5 text-left hover:bg-surface-sunken', focusRing('control'))}
              onClick={() => {
                onPick(hit);
                setOpen(false);
              }}
              data-testid="label-buy-product-hit"
            >
              {hit.sku ? <span className="shrink-0 font-mono text-role-caption font-semibold">{hit.sku}</span> : null}
              <span className="min-w-0 flex-1 truncate text-role-caption">{hit.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LabelBuyCard({
  onClose,
  onChanged,
}: {
  /** Leave the compose — strips `?buy=`. */
  onClose: () => void;
  /** Any queue read refreshes (a buy landed). */
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'order' | 'manual'>('order');
  const unlabeled = useQuery(awaitingLabelsQuery());
  const [orderId, setOrderId] = useState<number | null>(null);
  const picked = unlabeled.data?.find((order) => order.id === orderId) ?? null;

  const [address, setAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [product, setProduct] = useState<LabelBuyProduct | null>(null);
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [remember, setRemember] = useState(true);
  const [reference, setReference] = useState('');
  const field = (key: keyof AddressDraft) => ({
    value: address[key],
    onChange: (value: string) => setAddress((current) => ({ ...current, [key]: value })),
  });

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

  const manual = useMemo<LabelBuyManualSource | null>(() => {
    const w = num(weight);
    if (!shipTo || w == null) return null;
    const [l, wd, h] = [num(length), num(width), num(height)];
    return {
      shipTo,
      parcel: {
        weight: { value: w, unit: 'ounce' as const },
        dimensions: l != null && wd != null && h != null ? { length: l, width: wd, height: h, unit: 'inch' as const } : null,
      },
      reference: reference.trim() || null,
      product: product ? { skuCatalogId: product.skuCatalogId, sku: product.sku } : null,
      rememberParcel: remember,
      onBought: () => onChanged(),
    };
  }, [shipTo, weight, length, width, height, reference, product, remember, onChanged]);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="label-buy-card">
      <TabSwitch
        tabs={[{ id: 'order', label: 'An order' }, { id: 'manual', label: 'Manual' }]}
        activeTab={mode}
        onTabChange={(id) => setMode(id as 'order' | 'manual')}
        size="sm"
        fit="fill"
      />
      {mode === 'order' ? (
        <RecordGroup title="Orders with no label" testId="label-buy-unlabeled" action={
          <Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={onClose} data-testid="label-buy-close">
            Close
          </Button>
        }>
          <div className="flex flex-col px-4 pb-3 pt-1">
            {unlabeled.isPending ? <p className="py-2 text-role-caption text-text-muted">Reading orders…</p> : null}
            {unlabeled.isError ? <p className="py-2 text-role-caption text-text-danger">Could not read orders with no label.</p> : null}
            {unlabeled.isSuccess && unlabeled.data.length === 0 ? (
              <p className="py-2 text-role-caption text-text-muted">Every open order already has a label.</p>
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
                      data-testid="label-buy-unlabeled-order"
                    >
                      <span className="shrink-0 font-mono text-sm font-semibold">{order.order_id}</span>
                      <span className="min-w-0 flex-1 truncate text-role-caption">{order.product_title || order.sku}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {picked ? (
              <div className="mt-3">
                <BuyLabelSection
                  key={picked.id}
                  orderId={picked.id}
                  orderRef={picked.order_id}
                  onChange={() => {
                    void unlabeled.refetch();
                    onChanged();
                  }}
                  onPurchased={() => void unlabeled.refetch()}
                />
              </div>
            ) : (
              <p className="py-2 text-role-caption text-text-muted">Pick an order to buy its label. No item number.</p>
            )}
          </div>
        </RecordGroup>
      ) : (
        <>
          <RecordGroup title="Ship to" testId="label-buy-ship-to">
            <div className="grid grid-cols-1 gap-3 px-4 pb-3 pt-1 sm:grid-cols-2">
              <TextField label="Name" {...field('name')} data-testid="label-buy-name" />
              <TextField label="Company (optional)" {...field('company')} />
              <TextField label="Street" {...field('addressLine1')} className="sm:col-span-2" data-testid="label-buy-street" />
              <TextField label="Apt, suite (optional)" {...field('addressLine2')} className="sm:col-span-2" />
              <TextField label="City" {...field('cityLocality')} data-testid="label-buy-city" />
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-3">
                <TextField label="State" {...field('stateProvince')} data-testid="label-buy-state" />
                <TextField label="ZIP" {...field('postalCode')} data-testid="label-buy-zip" />
                <TextField label="Country" {...field('countryCode')} maxLength={2} />
              </div>
              <TextField label="Phone (optional)" {...field('phone')} />
            </div>
          </RecordGroup>
          <RecordGroup title="Package" testId="label-buy-package">
            <div className="flex flex-col gap-3 px-4 pb-3 pt-1">
              <ProductLink product={product} onPick={pickProduct} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <TextField label="Weight (oz)" value={weight} onChange={setWeight} inputMode="decimal" data-testid="label-buy-weight" />
                <TextField label="Length (in)" value={length} onChange={setLength} inputMode="decimal" data-testid="label-buy-length" />
                <TextField label="Width (in)" value={width} onChange={setWidth} inputMode="decimal" data-testid="label-buy-width" />
                <TextField label="Height (in)" value={height} onChange={setHeight} inputMode="decimal" data-testid="label-buy-height" />
              </div>
              <TextField
                label="Reference (optional) — order #, RMA, note"
                value={reference}
                onChange={setReference}
                maxLength={64}
                data-testid="label-buy-reference"
              />
              {product ? (
                <label className="flex items-center gap-2 text-role-caption text-text-default">
                  <Checkbox checked={remember} onCheckedChange={(next) => setRemember(next === true)} />
                  Remember this size and weight for {product.sku ?? 'this product'}
                </label>
              ) : null}
            </div>
          </RecordGroup>
          {manual ? (
            <BuyLabelSection
              orderId={0}
              orderRef=""
              manual={manual}
              onChange={onChanged}
            />
          ) : (
            <p className="px-4 pb-3 text-role-caption text-text-muted" data-testid="label-buy-manual-missing">
              Add the full ship-to address and the weight to buy.
            </p>
          )}
        </>
      )}
    </div>
  );
}
