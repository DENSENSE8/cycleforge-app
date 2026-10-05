import { photoStageLabel, type PhotoEvidenceStage } from '@/lib/photos/stages';
import type { TimelineItem } from './types';

/** Adapter: a unit's photos (the five stage buckets from `listUnitTimelinePhotos`) → `TimelineItem[]`. */

/**
 * Client mirror of `UnitTimelinePhotoSource`
 * (`src/lib/photos/queries/unit-timeline-photos.ts`) — kept structurally local
 * so this pure adapter never imports the server-only query module.
 */
export type UnitTimelinePhotoRowSource =
  | 'arrival'
  | 'unbox_carton'
  | 'unbox_item'
  | 'testing'
  | 'prepack'
  | 'packing';

export interface UnitTimelinePhotoRow {
  photoId: number;
  at: string | null;
  source: UnitTimelinePhotoRowSource;
  thumbUrl: string;
  fullUrl: string;
  /** Unit chrome from the query's serial_units join (optional on old payloads). */
  serial?: string | null;
  sku?: string | null;
}

/** Wire-source → evidence-stage bridge; labels resolve via `photoStageLabel`. */
export const UNIT_PHOTO_SOURCE_STAGE: Record<UnitTimelinePhotoRowSource, PhotoEvidenceStage> = {
  arrival: 'arrival_package',
  unbox_carton: 'unbox_carton',
  unbox_item: 'unbox_item',
  testing: 'testing',
  prepack: 'packing',
  packing: 'packing',
};

const SOURCE_TONE: Record<UnitTimelinePhotoRowSource, TimelineItem['tone']> = {
  arrival: 'muted',
  unbox_carton: 'muted',
  unbox_item: 'muted',
  testing: 'info',
  prepack: 'info',
  packing: 'success',
};

/**
 * Wire-source → rail-glyph key (`resolveTimelineGlyph`). A record, not a
 * ternary: the five-bucket spine split the old single `unbox` source into
 * carton + item, and both still read as one Unbox glyph on the rail.
 */
const SOURCE_EVENT_TYPE: Record<UnitTimelinePhotoRowSource, string> = {
  arrival: 'ARRIVAL_PHOTOS',
  unbox_carton: 'UNBOX_PHOTOS',
  unbox_item: 'UNBOX_PHOTOS',
  testing: 'TEST_PHOTOS',
  prepack: 'PREPACK_PHOTOS',
  packing: 'PACK_PHOTOS',
};

/** Stable display order: the evidence spine, inbound → outbound. */
const SOURCE_ORDER: UnitTimelinePhotoRowSource[] = [
  'arrival',
  'unbox_carton',
  'unbox_item',
  'testing',
  'prepack',
  'packing',
];

export function unitPhotosToTimeline(rows: UnitTimelinePhotoRow[]): TimelineItem[] {
  const bySource = new Map<UnitTimelinePhotoRowSource, UnitTimelinePhotoRow[]>();
  for (const r of rows) {
    const arr = bySource.get(r.source);
    if (arr) arr.push(r);
    else bySource.set(r.source, [r]);
  }

  const items: TimelineItem[] = [];
  for (const source of SOURCE_ORDER) {
    const list = bySource.get(source);
    if (!list || list.length === 0) continue;
    const sorted = [...list].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
    const stageLabel = source === 'prepack' ? 'Prepack' : photoStageLabel(UNIT_PHOTO_SOURCE_STAGE[source]);
    items.push({
      id: `unit-photos-${source}`,
      at: sorted[0]?.at ?? null,
      title: `${stageLabel} photos`,
      tone: SOURCE_TONE[source],
      subtitle: `${list.length} photo${list.length === 1 ? '' : 's'}`,
      media: sorted.map((r) => ({
        photoId: r.photoId,
        thumbUrl: r.thumbUrl,
        fullUrl: r.fullUrl,
        caption: stageLabel,
      })),
      sourceEventType: SOURCE_EVENT_TYPE[source],
    });
  }
  return items;
}
