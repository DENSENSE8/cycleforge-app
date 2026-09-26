'use client';

import { useEffect, useRef } from 'react';
import { generatePdfThumbnail } from '@/lib/manuals/pdfThumbnail';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';
import { saveManualThumbnail } from '../manuals-library-api';
import type { ManualRow } from '../manuals-tree';

/** Background thumbnail backfill. */
export function useThumbnailBackfill(
  filesHere: ManualRow[],
  debouncedQuery: string,
  setManuals: React.Dispatch<React.SetStateAction<ManualRow[]>>,
) {
  // Ids attempted this session — instance-scoped so a navigation away forgets
  // (the next mount can retry anything the server saved since).
  const backfillAttemptedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (debouncedQuery) return; // search view has different files
    const targets = filesHere.filter(
      (f) => f.source_url && !f.thumbnail_url && !backfillAttemptedRef.current.has(f.id),
    );
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const file of targets) {
        if (cancelled) return;
        backfillAttemptedRef.current.add(file.id);
        try {
          const thumb = await generatePdfThumbnail(productManualContentPath(file.id));
          if (cancelled || !thumb) continue;
          const thumbnailUrl = await saveManualThumbnail(file.id, thumb.blob);
          if (cancelled) return;
          if (thumbnailUrl) {
            setManuals((prev) =>
              prev.map((m) => (m.id === file.id ? { ...m, thumbnail_url: thumbnailUrl } : m)),
            );
          }
        } catch {
          // Best-effort. A failure means the file stays icon-only until the
          // next session retries it (or the viewer-side backfill kicks in).
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filesHere, debouncedQuery, setManuals]);
}
