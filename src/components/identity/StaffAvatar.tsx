'use client';

/**
 * THE staff avatar. Every surface that shows who did something composes this —
 * spine footer, sign-in picker, PIN chrome, timelines and serial journeys,
 * admin identity + schedule pills.
 *
 * Two facts, one resolution point:
 *   • photo   → `staff.avatar_photo_id`, served through the photos waist
 *               (`/api/photos/{id}/content?variant=thumb`).
 *   • fallback → the staffer's assigned colour + {@link staffInitials}.
 *
 * Both resolve from the staff identity cache (`@/utils/staff-colors`) keyed on
 * staff id, so a feed that only carries an actor's id needs no photo join and
 * no prop drilling. A caller holding the row already may pass `avatarPhotoId` /
 * `colorHex` to skip the lookup; a caller with only a NAME passes no id and
 * correctly gets initials — an avatar is never guessed from a display name.
 *
 * Do not hand-roll a `rounded-full` + initials span beside this; the geometry
 * lives in {@link IdentityMark}.
 */

import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { staffInitials } from '@/design-system/components/StaffBadge';
import { photoContentUrl } from '@/lib/photos/display-url';
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
  className,
  alt,
}: StaffAvatarProps) {
  // Re-render when the cache lands / an admin recolours / a photo is replaced.
  useStaffColorVersion();

  const photoId = avatarPhotoId === undefined ? getStaffAvatarPhotoId(staffId) : avatarPhotoId;
  const trimmed = (name ?? '').trim();

  return (
    <IdentityMark
      initials={trimmed ? staffInitials(trimmed) : '·'}
      src={photoId && photoId > 0 ? photoContentUrl(photoId, 'thumb') : null}
      colorHex={colorHex ?? getStaffColorHex({ id: staffId ?? null, color_hex: colorHex })}
      size={size}
      ring={ring}
      className={className}
      alt={alt}
    />
  );
}
