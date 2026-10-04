'use client';

/** THE staff avatar. */

import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { staffInitials } from '@/design-system/components/StaffBadge';
import { photoContentUrl } from '@/lib/photos/display-url';
import { STAFF_NAMES } from '@/utils/staff';
import { getStaffAvatarPhotoId, getStaffColorHex } from '@/utils/staff-colors';
import { IdentityMark, type IdentityMarkSize } from './IdentityMark';

interface StaffAvatarProps {
  staffId: number | string | null | undefined;
  name?: string | null;
  /**
   * Explicit override. `undefined` ⇒ resolve from the identity cache; pass a
   * value only when the caller already holds the staff row.
   */
  avatarPhotoId?: number | null;
  /** Explicit colour override (a row that already carries `color_hex`). */
  colorHex?: string | null;
  size?: IdentityMarkSize;
  ring?: boolean;
  /** Keep the staffer's assigned COLOUR visible when their photo shows, as a 2px ring (see {@link IdentityMark.ringHex}). */
  colorRing?: boolean;
  /** Mark face — see {@link IdentityMark} `face`. */
  face?: 'round' | 'record';
  className?: string;
  /** Accessible name. Omit on rows that already name the staffer in text. */
  alt?: string;
}

export function StaffAvatar({
  staffId,
  name,
  avatarPhotoId,
  colorHex,
  size = 'sm',
  ring = true,
  colorRing = false,
  face = 'round',
  className,
  alt,
}: StaffAvatarProps) {
  // Re-render when the cache lands / an admin recolours / a photo is replaced.
  // 0 = the server's empty cache (hydration included): resolve as the server did.
  const cacheReady = useStaffColorVersion() > 0;

  const photoId = avatarPhotoId === undefined ? (cacheReady ? getStaffAvatarPhotoId(staffId) : null) : avatarPhotoId;
  // Assigned marks must never paint a lone middle-dot when the feed omitted
  // the display name — resolve the dogfood map, then fall back to id digits.
  const parsedId = Number(staffId);
  const hasId = Number.isFinite(parsedId) && parsedId > 0;
  const trimmed =
    (name ?? '').trim() || (hasId ? (STAFF_NAMES[parsedId] ?? '').trim() : '');
  const initials = trimmed
    ? staffInitials(trimmed)
    : hasId
      ? String(parsedId).slice(-2)
      : '·';
  const resolvedColor = colorHex ?? getStaffColorHex({ id: cacheReady ? (staffId ?? null) : null, color_hex: colorHex });

  return (
    <IdentityMark
      initials={initials}
      src={photoId && photoId > 0 ? photoContentUrl(photoId, 'thumb') : null}
      colorHex={resolvedColor}
      size={size}
      ring={ring}
      ringHex={colorRing ? resolvedColor : null}
      face={face}
      className={className}
      alt={alt ?? (trimmed || undefined)}
    />
  );
}
