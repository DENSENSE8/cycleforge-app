/**
 * Order evidence photos → gallery inputs.
 *
 * The one mapper from an order's `/api/orders/:id/timeline` photo spine
 * (`UnitTimelinePhotoRow[]`, five stages of unit evidence) plus the legacy
 * `orders.packer_photos_url` blob onto the viewer's `PhotoGalleryInput[]`.
 *
 * Extracted from `/search`'s station hook (2026-08-21) because it was the ONLY
 * thing in that file with no SoT elsewhere: `photo-gallery-utils` ships
 * `receivingPhotoToGalleryInput` for the receiving side and nothing for this
 * one. Dependency-free and NOT `'use client'`, so a server caller can reach it
 * without pulling the gallery component's graph — the bundle-altitude rule in
 *
 * Read-only inputs: no `id`, so the viewer never offers a destructive action on
 * a photo this surface has no permission to touch.
 */

import type { PhotoGalleryInput } from '@/lib/photos/photo-gallery-utils';
import { photoStageLabel } from '@/lib/photos/stages';
import type { UnitTimelinePhotoRow } from '@/lib/timeline';

/** Timeline photo `source` → the stage vocabulary `photoStageLabel` speaks. */
const SOURCE_STAGE = {
  arrival: 'arrival_package',
  unbox_carton: 'unbox_carton',
  unbox_item: 'unbox_item',
  testing: 'testing',
  packing: 'packing',
} as const;

function toReadOnlyGalleryInput(url: string, caption?: string): PhotoGalleryInput {
  return { url, meta: caption ? { caption } : undefined };
}

/**
 * Unit evidence first (stage-captioned), then the legacy packer blob. URLs are
 * de-duplicated across BOTH spines — a packing photo that also came back on the
 * unit spine would otherwise appear twice in the lightbox.
 *
 * The legacy blob is untyped on the wire: it has been a bare string array and
 * an array of `{ url }` objects at different points, so both shapes parse and
 * anything else is skipped rather than rendered as `[object Object]`.
 */
export function buildOrderGalleryPhotos(
  unitPhotos: UnitTimelinePhotoRow[],
  packerUrls: unknown,
): PhotoGalleryInput[] {
  const seen = new Set<string>();
  const out: PhotoGalleryInput[] = [];

  for (const photo of unitPhotos) {
    const url = String(photo.fullUrl || photo.thumbUrl || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(toReadOnlyGalleryInput(url, photoStageLabel(SOURCE_STAGE[photo.source])));
  }

  const legacy = Array.isArray(packerUrls) ? packerUrls : [];
  for (const entry of legacy) {
    const url =
      typeof entry === 'string'
        ? entry.trim()
        : entry && typeof entry === 'object' && 'url' in entry
          ? String((entry as { url?: unknown }).url ?? '').trim()
          : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(toReadOnlyGalleryInput(url, photoStageLabel('packing')));
  }

  return out;
}
