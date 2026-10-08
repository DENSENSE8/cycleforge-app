'use client';

/**
 * Stock record — Photos · N for a real SKU: every photo the SKU holds, once
 * (`GET /api/sku-stock/[sku]` — its SKU_STOCK photos, including any a paired
 * `TMP-` placeholder carried in, plus legacy SKU-record photos). Once the SKU
 * has its own linked cover, Upload · Phone ride this header's right edge,
 * not the item photo (owner 2026-10-08).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { fetchSkuDetail } from '@/components/sku/sku-detail/sku-detail-api';
import { SkuExceptionPhotosSection } from '@/components/inventory/sku-exceptions/SkuExceptionPhotosSection';
import { photoContentUrl } from '@/lib/photos/display-url';
import { StockPhotoVerbs } from './StockPhotoTile';

export const SKU_STOCK_PHOTOS_QUERY_KEY = ['sku-stock-photos'] as const;

export function StockPhotosGroup({ sku, stockId, linked }: { sku: string; stockId: number | null; linked: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const queryKey = [...SKU_STOCK_PHOTOS_QUERY_KEY, sku] as const;
  const photos = useQuery({
    queryKey,
    enabled: sku.trim() !== '',
    queryFn: async () =>
      (await fetchSkuDetail(sku)).photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        thumbUrl: photoContentUrl(photo.id, 'thumb'),
      })),
  });
  const refresh = async () => {
    // The record/card cover rides the server-rendered stock rows.
    router.refresh();
    await queryClient.invalidateQueries({ queryKey });
  };

  return (
    <SkuExceptionPhotosSection
      photos={photos.data ?? []}
      stockId={stockId}
      testId="stock-record-photos"
      onChanged={refresh}
      action={
        linked ? (
          <span className="flex items-center gap-1.5">
            <StockPhotoVerbs stockId={stockId} sku={sku} onChanged={() => void refresh()} face="header" />
          </span>
        ) : undefined
      }
    />
  );
}
