'use client';

/**
 * The ONE product-photo upload for a stock SKU (a real SKU or a `TMP-`
 * placeholder): photos land as `SKU_STOCK` primary links on its `sku_stock`
 * row — the first one is the SKU's cover on every stock card and record
 * (`getStockByLocation`). The caller places the trigger (a record header's
 * top-right verb); this owns the hidden picker and the upload loop.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { toast } from '@/lib/toast';

/** `onChanged` — a surface that reads the SKU client-side (not through the route loader `router.refresh` re-runs) re-reads it here. */
export function useSkuStockPhotoUpload(stockId: number | null, onChanged?: () => void): {
  /** Mount once, anywhere in the record (a hidden `<input type="file">`). */
  input: ReactNode;
  /** Open the picker; a no-op while an upload runs or with no stock row. */
  pick: () => void;
  /** `Uploading 1/3` while it runs, else null. */
  progress: string | null;
} {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const upload = useCallback(
    async (files: File[]) => {
      if (stockId == null || files.length === 0) return;
      let failed = 0;
      for (const [index, file] of files.entries()) {
        setProgress(`Uploading ${index + 1}/${files.length}`);
        try {
          await uploadPhotoClient({ file, entityType: 'SKU_STOCK', entityId: stockId, linkRole: 'primary' });
        } catch (err) {
          failed += 1;
          toast.error(err instanceof Error ? err.message : `Could not upload ${file.name}`);
        }
      }
      setProgress(null);
      await invalidateSkuExceptions(queryClient);
      router.refresh();
      onChanged?.();
      const added = files.length - failed;
      if (added > 0) toast.success(`Added ${added} photo${added === 1 ? '' : 's'}`);
    },
    [onChanged, queryClient, router, stockId],
  );

  const pick = useCallback(() => {
    if (stockId == null || progress) return;
    fileRef.current?.click();
  }, [progress, stockId]);

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        void upload(files);
      }}
      data-testid="stock-photo-input"
    />
  );

  return { input, pick, progress };
}
