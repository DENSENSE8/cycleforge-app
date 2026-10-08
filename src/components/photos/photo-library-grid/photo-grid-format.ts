import type { LibraryPhoto, PhotoIdentityMeta } from '../photo-library-types';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { PhotoGalleryInput, PhotoMeta } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import {
  photoFileName,
  photoGroupHeaderLabel,
  photoGroupKey,
  photoIdentityLine,
  photoPrimaryLabel,
  photoRefLabel,
  UNLINKED_PHOTO_GROUP_KEY,
} from '@/lib/photos/display-names';
import { formatDateKeyMedium, formatStageClockTimePST, getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';

/** @deprecated Use {@link UNLINKED_PHOTO_GROUP_KEY} from display-names. */
const UNLINKED_TICKET_KEY = UNLINKED_PHOTO_GROUP_KEY;

/** What a group band identifies — a claims ticket, a PO / order / unit ref, or nothing. */
export type PhotoGroupKind = 'ticket' | 'ref' | 'unlinked';

interface TicketGroup {
  key: string;
  kind: PhotoGroupKind;
  /** Zendesk ticket number for `ticket:` groups (drives Sync to NAS); null otherwise. */
  ticketNumber: string | null;
  /** Display label for the band (last-8 face of the ticket / ref, or "Unlinked"). */
  label: string;
  /** PST capture date and time (or first – last span) of the group's photos. */
  dateLabel: string;
  photos: LibraryPhoto[];
}

/**
 * `Oct 7, 2:14 PM` for one moment, `Oct 7, 9:02 AM – 2:14 PM` within a day,
 * `Oct 3, 9:02 AM – Oct 7, 2:14 PM` across days. The year joins only outside
 * the current PST year; the clock follows the staffer's 12/24-hour setting.
 */
function photoGroupDateLabel(firstAt: string, lastAt: string): string {
  const first = toPSTDateKey(firstAt);
  const last = toPSTDateKey(lastAt);
  if (!first || !last) return '';
  const thisYear = getCurrentPSTDateKey().slice(0, 4);
  const day = (dateKey: string) =>
    formatDateKeyMedium(dateKey, { weekday: 'none', withYear: !dateKey.startsWith(thisYear) });
  const firstTime = formatStageClockTimePST(firstAt);
  const lastTime = formatStageClockTimePST(lastAt);
  if (first !== last) return `${day(first)}, ${firstTime} – ${day(last)}, ${lastTime}`;
  return firstTime === lastTime ? `${day(first)}, ${firstTime}` : `${day(first)}, ${firstTime} – ${lastTime}`;
}

/** Group photos by ticket# (claims) or PO#/order ref; oldest→newest within each group. */
export function groupPhotosByTicket(
  photos: LibraryPhoto[],
  scope: PhotoLibrarySourceScope,
): TicketGroup[] {
  const order: string[] = [];
  const map = new Map<string, TicketGroup>();
  for (const photo of photos) {
    const key = photoGroupKey(photo, scope);
    let group = map.get(key);
    if (!group) {
      const raw = key.startsWith('po:') ? key.slice('po:'.length) : undefined;
      const ticketNumber = key.startsWith('ticket:') ? key.slice('ticket:'.length) : null;
      group = {
        key,
        kind: ticketNumber ? 'ticket' : key === UNLINKED_PHOTO_GROUP_KEY ? 'unlinked' : 'ref',
        ticketNumber,
        label: photoGroupHeaderLabel(key, scope, raw),
        dateLabel: '',
        photos: [],
      };
      map.set(key, group);
      order.push(key);
    }
    group.photos.push(photo);
  }
  for (const group of map.values()) {
    group.photos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    group.dateLabel = photoGroupDateLabel(
      group.photos[0]!.createdAt,
      group.photos[group.photos.length - 1]!.createdAt,
    );
  }
  return order.map((key) => map.get(key)!);
}

export { photoFileName, photoIdentityLine, photoPrimaryLabel, photoRefLabel };

export function documentPrimaryLabel(photo: LibraryPhoto): string {
  if (photo.filename?.trim()) return photo.filename.trim();
  if (photo.documentType === 'shipping_label') {
    return photo.tracking?.trim() ? `Label · ${photo.tracking}` : 'Shipping label';
  }
  if (photo.documentType === 'packing_slip') {
    return photo.poRef?.trim() ? `Slip · ${photo.poRef}` : 'Packing slip';
  }
  return photo.poRef?.trim() ? `Order ${photo.poRef}` : `Document ${Math.abs(photo.id)}`;
}

/**
 * Project a `LibraryPhoto` into the gallery's context-panel meta. The identity
 * extension (SKU · serial · stage) rides along structurally so the viewer panel
 * can surface it — `PhotoMeta` itself stays untouched (see PhotoContextPanel).
 */
function libraryPhotoMeta(
  photo: LibraryPhoto,
  scope: PhotoLibrarySourceScope,
): PhotoMeta & PhotoIdentityMeta {
  return {
    poRef: photo.poRef,
    photoType: photo.photoType,
    ticketId: photo.ticketId ?? null,
    takenByStaffId: photo.takenByStaffId ?? null,
    takenByStaffName: photo.takenByStaffName ?? null,
    createdAt: photo.createdAt,
    clientCapturedAt: photo.clientCapturedAt ?? null,
    damageDetected: photo.damageDetected ?? null,
    hasAnalysis: photo.hasAnalysis ?? null,
    caption: photo.caption ?? null,
    sourceScope: scope,
    sku: photo.sku ?? null,
    serialNumber: photo.serialNumber ?? null,
    unitUid: photo.unitUid ?? null,
    stage: photo.stage ?? null,
  };
}

/** Gallery inputs for a list of library photos, carrying full panel context. */
export function toGalleryInputs(photos: LibraryPhoto[], scope: PhotoLibrarySourceScope): PhotoGalleryInput[] {
  return photos.map((p) => ({ id: p.id, url: p.displayUrl, thumbUrl: p.thumbUrl, meta: libraryPhotoMeta(p, scope) }));
}

/** Decide what a tile click means. */
export function clickSelectsInstead(e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }, selectionActive: boolean): boolean {
  return selectionActive || e.shiftKey || e.metaKey || e.ctrlKey;
}
