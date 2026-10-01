'use client';

/**
 * Stock record — Photos · N for a real SKU: every photo the SKU holds, once
 * (`GET /api/sku-stock/[sku]` — its SKU_STOCK photos, including any a paired
 * `TMP-` placeholder carried in, plus legacy SKU-record photos).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { fetchSkuDetail } from '@/components/sku/sku-detail/sku-detail-api';
import { SkuExceptionPhotosSection } from '@/components/inventory/sku-exceptions/SkuExceptionPhotosSection';
import { photoContentUrl } from '@/lib/photos/display-url';

export const SKU_STOCK_PHOTOS_QUERY_KEY = ['sku-stock-photos'] as const;

export function StockPhotosGroup({ sku, stockId }: { sku: string; stockId: number | null }) {
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

  return (
    <SkuExceptionPhotosSection
      photos={photos.data ?? []}
      stockId={stockId}
      testId="stock-record-photos"
      onChanged={async () => {
        // The record/card cover rides the server-rendered stock rows.
        router.refresh();
        await queryClient.invalidateQueries({ queryKey });
      }}
    />
  );
}
