/** Order evidence photos → gallery inputs. */

import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
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

/** Unit evidence first (stage-captioned), then the legacy packer blob. */
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
