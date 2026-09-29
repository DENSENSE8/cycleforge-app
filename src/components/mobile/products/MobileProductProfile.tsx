'use client';

/** One product's pack KPI standard and remembered shipping package. */

import { useCallback, useEffect, useState } from 'react';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { MobileProductPackTimeCard } from '@/components/mobile/products/MobileProductPackTimeCard';
import { MobileProductParcelCard } from '@/components/mobile/products/MobileProductParcelCard';
import type { ProductDetailPayload } from '@/lib/products/product-detail';

export function MobileProductProfile({ sku }: { sku: string }) {
  const [record, setRecord] = useState<ProductDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as ProductDetailPayload | { error?: string } | null;
      if (!res.ok || !body || !('success' in body) || !body.success) {
        throw new Error(body && 'error' in body ? body.error || 'Product not found.' : 'Product not found.');
      }
      setRecord(body);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load product.');
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [sku]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DetailRecordFrame
      record={record}
      state={{ loading, error, onRetry: load, missing: 'Product not found.' }}
      bar={{
        title: record?.product.sku || sku,
        mono: true,
        subtitle: record?.product.product_title || 'Product',
        backHref: '/m/products',
        close: true,
      }}
    >
      {(product) => (
        <div className="flex-1 divide-y divide-mode-rule">
          <section className="flex items-center gap-3 px-mode-page py-3">
            <span className="size-16 shrink-0 overflow-hidden bg-surface-sunken ring-1 ring-inset ring-mode-rule">
              {product.product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.product.image_url} alt="" className="h-full w-full object-cover" />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-role-data font-semibold text-mode-ink">{product.product.product_title || product.product.sku}</p>
              <p className="mt-1 font-mono text-role-micro text-mode-muted">SKU {product.product.sku}</p>
              {product.itemNumbers[0] ? (
                <p className="mt-0.5 truncate font-mono text-role-micro text-mode-muted">Item # {product.itemNumbers.join(' · ')}</p>
              ) : null}
            </div>
          </section>

          <MobileProductPackTimeCard
            catalogId={product.product.id}
            packProfile={product.packProfile}
            onSaved={(next) => setRecord((current) => current ? { ...current, packProfile: next } : current)}
          />

          <MobileProductParcelCard
            sku={product.product.sku}
            parcel={product.parcel}
            itemNumbers={product.itemNumbers}
            onSaved={(next) => setRecord((current) => current ? { ...current, parcel: next } : current)}
          />
        </div>
      )}
    </DetailRecordFrame>
  );
}
