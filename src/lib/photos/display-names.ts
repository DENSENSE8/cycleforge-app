import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { PhotoEvidenceStage } from '@/lib/photos/stages';

/** Minimal photo shape for naming helpers (library row, share meta, zip). */
interface PhotoNamingFields {
  id: number;
  poRef?: string | null;
  ticketId?: number | null;
  photoType?: string | null;
  /** Per-row derived scope — enables ticket grouping under "All photos". */
  sourceScope?: PhotoLibrarySourceScope | null;
  /** Resolved SKU (receiving line first, then serialized unit) — display join only. */
  sku?: string | null;
  /** Serial of the directly linked unit (testing / packing evidence). */
  serialNumber?: string | null;
  /** Evidence stage derived via `stageFromPhotoType` (never re-derive inline). */
  stage?: PhotoEvidenceStage | null;
}

/**
 * Path-safe file-name slug per evidence stage (`PO-14-4421_SKU_SN-x_arrival.jpg`
 * style). Display labels stay in `photoStageLabel` — this map is for names only.
 */
export const PHOTO_STAGE_FILE_SLUGS: Record<PhotoEvidenceStage, string> = {
  arrival_package: 'arrival',
  unbox_carton: 'unbox-carton',
  unbox_item: 'unbox-item',
  testing: 'testing',
  packing: 'packing',
};

/** Collapse a free-form identifier into a filesystem/URL-safe name part. */
function pathSafePart(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** `SKU`/`SN-serial`/stage-slug name parts for a photo, in order (may be empty). */
function identityNameParts(photo: PhotoNamingFields): string[] {
  const parts: string[] = [];
  if (photo.sku?.trim()) parts.push(pathSafePart(photo.sku));
  if (photo.serialNumber?.trim()) parts.push(`SN-${pathSafePart(photo.serialNumber)}`);
  if (photo.stage) parts.push(PHOTO_STAGE_FILE_SLUGS[photo.stage]);
  return parts.filter(Boolean);
}

export const UNLINKED_PHOTO_GROUP_KEY = '__unlinked__';

/** True when ticket-based naming/grouping should apply. */
function isClaimsPhotoNaming(
  scope: PhotoLibrarySourceScope,
  photo?: Pick<PhotoNamingFields, 'sourceScope'>,
): boolean {
  return scope === 'claims' || photo?.sourceScope === 'claims';
}

/** Claims ticket chip label — `#4821` (no "Ticket" prefix). */
export function claimsTicketLabel(ticketId: number | string): string {
  return `#${ticketId}`;
}

/** Zendesk ticket id used for claims-scope labels and grouping. */
function photoTicketId(
  photo: PhotoNamingFields,
  scope: PhotoLibrarySourceScope,
): number | null {
  if (!isClaimsPhotoNaming(scope, photo) || photo.ticketId == null) return null;
  const id = Number(photo.ticketId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Stable key for group-by-ticket / folder drill (ticket id or po ref). */
export function photoGroupKey(photo: PhotoNamingFields, scope: PhotoLibrarySourceScope): string {
  const ticketId = photoTicketId(photo, scope);
  if (ticketId != null) return `ticket:${ticketId}`;
  const ref = photo.poRef?.trim();
  if (ref) return isClaimsPhotoNaming(scope, photo) ? UNLINKED_PHOTO_GROUP_KEY : `po:${ref}`;
  return UNLINKED_PHOTO_GROUP_KEY;
}

/** Section header / folder title for a group key. */
export function photoGroupHeaderLabel(
  key: string,
  scope: PhotoLibrarySourceScope,
  rawLabel?: string,
): string {
  if (key === UNLINKED_PHOTO_GROUP_KEY) return 'Unlinked';
  if (key.startsWith('ticket:')) {
    return claimsTicketLabel(key.slice('ticket:'.length));
  }
  const ref = rawLabel ?? key.replace(/^po:/, '');
  if (scope === 'local_pickup') return `Pickup ${ref}`;
  if (scope === 'packing') return `Order ${ref}`;
  if (scope === 'repair') return `Unit ${ref}`;
  if (scope === 'outbound') return `Order ${ref}`;
  return `PO ${ref}`;
}

/** Filesystem-safe export base (share links, ZIP entries) — ticket-first when linked. */
export function photoExportBaseName(photo: PhotoNamingFields): string {
  const ticketId =
    photo.ticketId != null && Number(photo.ticketId) > 0 ? Number(photo.ticketId) : null;
  const base =
    ticketId != null
      ? String(ticketId)
      : photo.poRef?.trim()
        ? `PO-${photo.poRef.trim()}`
        : (photo.photoType?.toLowerCase().replace(/_/g, '-') || `photo-${photo.id}`);
  return [base, ...identityNameParts(photo)].join('_');
}

export function photoFileName(photo: PhotoNamingFields, scope: PhotoLibrarySourceScope): string {
  const ticketId = photoTicketId(photo, scope);
  const base =
    ticketId != null
      ? String(ticketId)
      : photo.poRef
        ? `PO-${photo.poRef}`
        : (photo.photoType?.toLowerCase().replace(/_/g, '-') ?? 'photo');
  return `${[base, ...identityNameParts(photo)].join('_')}-${photo.id}.jpg`;
}

/**
 * `SKU · serial` meta line for tiles / rows — the second line of the house
 * one-row anatomy (title = ref, meta = identity). Null when neither is known.
 */
export function photoIdentityLine(photo: PhotoNamingFields): string | null {
  const parts = [photo.sku?.trim(), photo.serialNumber?.trim()].filter(
    (part): part is string => !!part,
  );
  return parts.length ? parts.join(' · ') : null;
}

/** Short ref label (ticket → PO → type → id) — tile titles, where the identity
 *  pair renders as its own meta line instead of inflating the title. */
export function photoRefLabel(photo: PhotoNamingFields, scope: PhotoLibrarySourceScope): string {
  const ticketId = photoTicketId(photo, scope);
  if (ticketId != null) return claimsTicketLabel(ticketId);
  if (photo.poRef) return `PO ${photo.poRef}`;
  return photo.photoType?.replace(/_/g, ' ').toLowerCase() ?? `Photo ${photo.id}`;
}

/** Full evidence name — preference: ticket → PO · SKU · serial → PO → type → id. */
export function photoPrimaryLabel(photo: PhotoNamingFields, scope: PhotoLibrarySourceScope): string {
  const ticketId = photoTicketId(photo, scope);
  if (ticketId != null) return claimsTicketLabel(ticketId);
  const identity = photoIdentityLine(photo);
  if (photo.poRef) return identity ? `PO ${photo.poRef} · ${identity}` : `PO ${photo.poRef}`;
  if (identity) return identity;
  return photo.photoType?.replace(/_/g, ' ').toLowerCase() ?? `Photo ${photo.id}`;
}

/** Auto title for share page / ZIP from a selection's dominant ref. */
export function photoShareTitle(
  rows: PhotoNamingFields[],
  scope: PhotoLibrarySourceScope,
  count = rows.length,
): string {
  if (scope === 'claims' || rows.some((r) => r.sourceScope === 'claims')) {
    const ticket = rows.find((r) => photoTicketId(r, scope) != null);
    const ticketId = ticket ? photoTicketId(ticket, scope) : null;
    if (ticketId != null) return `${claimsTicketLabel(ticketId)} photos (${count})`;
  }
  const po = rows.find((r) => r.poRef?.trim())?.poRef?.trim();
  return po ? `PO ${po} photos (${count})` : `Photos (${count})`;
}

/** Backfill claims display ref from ticket link when po_ref still holds the PO#. */
function withClaimsDisplayRef<T extends PhotoNamingFields & { sourceScope?: PhotoLibrarySourceScope | null }>(
  photo: T,
  scope: PhotoLibrarySourceScope,
): T {
  const ticketId = photoTicketId(photo, scope);
  if (ticketId == null) return photo;
  return { ...photo, poRef: String(ticketId) };
}
