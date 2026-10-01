'use client';

/** One product's pack KPI standard and remembered shipping package. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera } from '@/components/Icons';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { Button } from '@/design-system/primitives';
import { MobileProductPackTimeCard } from '@/components/mobile/products/MobileProductPackTimeCard';
import { MobileProductParcelCard } from '@/components/mobile/products/MobileProductParcelCard';
import { MobileSkuLocations } from '@/components/mobile/products/MobileSkuLocations';
import { MobileNativePhotoInput } from '@/components/mobile/photos/MobileNativePhotoCapture';
import { useAuth } from '@/contexts/AuthContext';
import { uploadSkuProductPhoto } from '@/lib/photos/sku-product-photo-upload';
import type { ProductDetailPayload } from '@/lib/products/product-detail';
import { toast } from '@/lib/toast';

export function MobileProductProfile({ sku }: { sku: string }) {
  const { has } = useAuth();
  const photoInput = useRef<HTMLInputElement | null>(null);
  const [record, setRecord] = useState<ProductDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const mayAddPhoto = has('receiving.upload_photo');

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

  const addProductPhoto = useCallback(async (file: File | null) => {
    if (!file || !record || !mayAddPhoto || photoBusy) return;
    setPhotoBusy(true);
    try {
      const photo = await uploadSkuProductPhoto(record.product.id, file);
      setRecord((current) => current ? {
        ...current,
        product: { ...current.product, image_url: photo.url },
      } : current);
      toast.success('Product photo added');
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'Could not add the product photo');
    } finally {
      setPhotoBusy(false);
    }
  }, [mayAddPhoto, photoBusy, record]);

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
          <section className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 px-mode-page py-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center">
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
            <div className="col-span-2 sm:col-span-1">
              <MobileNativePhotoInput
                ref={photoInput}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = '';
                  void addProductPhoto(file);
                }}
                data-testid="mobile-product-photo-input"
              />
              <Button
                variant="primary"
                size="lg"
                radius="surface"
                icon={<Camera className="size-5" aria-hidden />}
                onClick={() => photoInput.current?.click()}
                disabled={!mayAddPhoto || photoBusy}
                loading={photoBusy}
                title={mayAddPhoto ? 'Take or choose a product photo' : 'You do not have permission to add product photos'}
                className="w-full justify-center sm:w-auto"
                data-testid="mobile-product-add-photo"
              >
                Add photo
              </Button>
            </div>
          </section>

          <MobileSkuLocations sku={product.product.sku} />

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
