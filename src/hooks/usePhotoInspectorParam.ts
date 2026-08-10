'use client';

/**
 * Media Library `?photoId=` paint-pending — the desk inspector's open record.
 *
 * Mount-gated: the rail only exists while a photo id is present, so the write
 * has to paint before App Router's soft-replace lands or the tick reads dead
 * (`source-of-truth.md` → Optimistic URL-param paint). Modelled on
 * {@link useLabelsHistoryIdParam}.
 *
 * The param is a DISPLAY param (`parsePhotoLibraryDisplayParams`), never a
 * filter — it must not reach `buildLibraryWhere`. Eviction is stated there:
 * written from selection, cleared with it.
 *
 * `shareKey` exists because the library's chrome and its grid are separate React
 * subtrees under `DashboardScrollShell`; one pending has to paint both.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';

const PHOTOS_PATH = '/ops/photos';

/** Positive integer ids only — the same shape `parsePhotoLibraryDisplayParams` accepts. */
function normalizePhotoId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed && /^[1-9]\d*$/.test(trimmed) ? trimmed : null;
}

export function usePhotoInspectorParam(): {
  photoId: string | null;
  setPhotoId: (next: string | null) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlPhotoId = useMemo(
    () => normalizePhotoId(searchParams.get('photoId')),
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      // Seed from the LIVE address bar. A filter patch landing in the same tick
      // leaves React's `searchParams` a frame stale, and a stale seed would drop
      // the key that patch just wrote.
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      const base = pathname?.startsWith(PHOTOS_PATH) ? pathname : PHOTOS_PATH;
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: string | null) => {
    if (next) params.set('photoId', next);
    else params.delete('photoId');
  }, []);

  const { value, setValue } = useOptimisticUrlParam<string | null>({
    urlValue: urlPhotoId,
    replace,
    write,
    shareKey: 'photos:photoId',
  });

  return { photoId: value, setPhotoId: setValue };
}
