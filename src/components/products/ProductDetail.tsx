'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from '@/components/Icons';
import { BundleComponentsStrip } from '@/components/products/BundleComponentsStrip';
import { InventoryMasterChip } from '@/components/products/InventoryMasterChip';
import { ProductGtinField } from '@/components/products/ProductGtinField';
import { ProductPackTimeCard } from '@/components/products/ProductPackTimeCard';
import { ProductParcelCard } from '@/components/products/ProductParcelCard';
import type { ProductDetailPayload } from '@/components/products/types';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { cornerClass } from '@/design-system/tokens/radius';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';

/**
 * One product's body. `page`: the standalone `/products/sku/[sku]` landing
 * (breadcrumb + identity heading). `record`: hosted by the catalog list's
 * record plane, which already names the product — so no breadcrumb and no
 * heading, only the photo and its status chips above the sections.
 */
export function ProductDetail({ sku, face = 'page' }: { sku: string; face?: 'page' | 'record' }) {
  const [payload, setPayload] = useState<ProductDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const run = async () => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, { credentials: 'same-origin' });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ProductDetailPayload;
        if (!cancelled) setPayload(data);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'Failed to load product');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [sku]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-text-faint"><Loader2 className="h-5 w-5 animate-spin" /><span className="ml-2 text-sm">Loading {sku}…</span></div>;
  }
  if (error || !payload?.success) {
    const failure = <div className={cn(cornerClass('surface'), 'border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700')}>{error || 'Product not found'}</div>;
    if (face === 'record') return <div className="px-4 py-6">{failure}</div>;
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {failure}
        <p className="mt-4 text-sm text-text-soft"><Link href="/products" className="text-blue-600 underline">Back to Products</Link></p>
      </div>
    );
  }

  const { product, platforms, stock, packProfile, parcel, itemNumbers } = payload;
  return (
    <div className="h-full min-h-0 bg-surface-canvas">
      <TriageScrollLayout
        header={<ProductIdentityHeader product={product} face={face} />}
        sections={[
          {
            id: 'product-identity',
            label: 'Product identity',
            children: (
              <div className="space-y-1.5 text-sm">
                <ProductGtinField catalogId={product.id} gtin={product.gtin} onSaved={(gtin) => setPayload((prev) => prev?.success ? { ...prev, product: { ...prev.product, gtin } } : prev)} />
                <DetailRow label="UPC" value={product.upc} mono />
                <DetailRow label="Item number" value={itemNumbers[0] ?? null} mono />
                <DetailRow label="Inventory item ID" value={product.provider_item_id} mono />
                <DetailRow label="Category" value={product.category} />
              </div>
            ),
          },
          {
            id: 'product-stock',
            label: 'Live stock',
            children: (
              <div className="space-y-2 text-sm">
                <div className="flex justify-end"><Link href={`/inventory?search=${encodeURIComponent(product.sku)}`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">Open in Inventory <ExternalLink className="h-3 w-3" /></Link></div>
                <DetailRow label="Warehouse qty" value={String(stock.warehouse_qty)} />
                {stock.units_by_status.length > 0 ? (
                  <div className="border-t border-border-hairline pt-2">
                    <div className="mb-1 text-role-micro font-medium text-text-soft">Serial units by status</div>
                    <div className="flex flex-wrap gap-1">{stock.units_by_status.map((unit) => <span key={unit.status} className="inset-chip bg-surface-sunken text-role-caption text-text-muted">{unit.status.toLowerCase()}: {unit.count}</span>)}</div>
                  </div>
                ) : <div className="text-xs text-text-faint">No serial units tracked.</div>}
              </div>
            ),
          },
          {
            id: 'product-pack-time',
            label: 'Time to pack',
            children: <ProductPackTimeCard catalogId={product.id} packProfile={packProfile} embedded onSaved={(next) => setPayload((prev) => prev?.success ? { ...prev, packProfile: next } : prev)} />,
          },
          {
            id: 'product-parcel',
            label: 'Shipping package',
            children: <ProductParcelCard sku={product.sku} parcel={parcel} itemNumbers={itemNumbers} embedded onSaved={(next) => setPayload((prev) => prev?.success ? { ...prev, parcel: next } : prev)} />,
          },
          { id: 'product-bundle', label: 'Bundle components', children: <BundleComponentsStrip catalogId={product.id} sku={product.sku} /> },
          { id: 'product-platforms', label: `Platform links (${platforms.length})`, children: <PlatformLinks platforms={platforms} /> },
          {
            id: 'product-operations',
            label: 'Operations',
            children: <p className="text-xs text-text-soft">Looking for stock details? <Link href={`/inventory?sku=${encodeURIComponent(product.sku)}`} className="text-blue-600 underline">Open stock record</Link></p>,
          },
        ]}
      />
    </div>
  );
}

function ProductIdentityHeader({ product, face }: { product: ProductDetailPayload extends { success: true; product: infer P } ? P : never; face: 'page' | 'record' }) {
  const photo = (
    <div className={cn(cornerClass('surface'), 'size-16 shrink-0 overflow-hidden border border-border-soft bg-surface-canvas')}>
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image_url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : <div className="flex size-full items-center justify-center text-xs text-text-faint">No image</div>}
    </div>
  );
  if (face === 'record') {
    return (
      <header className="flex min-w-0 items-center gap-4 border-b border-border-hairline bg-surface-card px-6 py-4">
        {photo}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-xs text-text-soft">
          {product.provider_item_id ? <InventoryMasterChip providerItemId={product.provider_item_id} /> : null}
          {product.category ? <span>{product.category}</span> : null}
          {!product.is_active ? <span className="inset-chip bg-surface-sunken text-text-soft">Inactive</span> : null}
        </div>
      </header>
    );
  }
  return (
    <header className="border-b border-border-hairline bg-surface-card px-6 py-4">
      <nav className="mb-3 text-xs text-text-soft"><Link href="/products" className="hover:text-text-default">Products</Link><span className="mx-1.5">/</span><span className="font-mono text-text-muted">{product.sku}</span></nav>
      <div className="flex min-w-0 items-center gap-4">
        {photo}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-semibold text-text-default">{product.product_title || product.sku}</h1>{product.provider_item_id ? <InventoryMasterChip providerItemId={product.provider_item_id} /> : null}</div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-soft"><span className="font-mono">{product.sku}</span>{product.category ? <span>· {product.category}</span> : null}{!product.is_active ? <span className="inset-chip bg-surface-sunken text-text-soft">Inactive</span> : null}</div>
        </div>
      </div>
    </header>
  );
}

function PlatformLinks({ platforms }: { platforms: ProductDetailPayload extends { success: true; platforms: infer P } ? P : never }) {
  if (platforms.length === 0) return <div className="text-xs text-text-faint">No platform links yet.</div>;
  return (
    <ul className="divide-y divide-border-hairline">
      {platforms.map((platform) => {
        const meta = sourcePlatformMeta(platform.platform);
        return (
          <li key={platform.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <HoverTooltip label={meta.label || platform.platform} asChild focusable={false}><span className="inline-flex shrink-0" aria-label={meta.label || platform.platform}><PlatformMark platformValue={meta.value || platform.platform} meta={meta.value ? meta : undefined} /></span></HoverTooltip>
              {platform.account_name ? <span className="text-xs text-text-soft">{platform.account_name}</span> : null}
              <span className="font-mono text-xs text-text-muted">{platform.platform_sku || platform.platform_item_id || '—'}</span>
            </div>
            {platform.display_name ? <span className="text-xs text-text-soft">{platform.display_name}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return <div className="flex items-baseline gap-2 text-xs"><span className="w-28 shrink-0 text-text-soft">{label}</span><span className={cn('flex-1 truncate', mono && 'font-mono', value ? 'text-text-default' : 'text-text-faint')}>{value || '—'}</span></div>;
}
