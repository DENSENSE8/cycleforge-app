'use client';

/**
 * A staffer in one ledger cell: their colour mark + their name in their
 * colour. Colour resolves by ID from the staff identity cache
 * (`StaffColorsProvider`, the roster the app already loads) — a name alone
 * cannot be coloured, so every row that paints a staffer carries the id.
 * The name falls back to the roster when the row only has the id.
 */

import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { peekActiveStaff } from '@/lib/staffCache';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { STAFF_NAMES } from '@/utils/staff';
import { cn } from '@/utils/_cn';
import { StaffAvatar } from './StaffAvatar';

export interface StaffCellProps {
  staffId: number | null | undefined;
  name?: string | null;
  /** The row's saved identity colour, when already loaded with the record. */
  colorHex?: string | null;
  className?: string;
}

/** The staffer's name: the row's own, else the roster's, else the dogfood map. */
export function staffCellName(staffId: number | null | undefined, name: string | null | undefined): string | null {
  const own = name?.trim();
  if (own) return own;
  if (!staffId) return null;
  const listed = peekActiveStaff()?.find((member) => member.id === staffId)?.name?.trim();
  return listed || STAFF_NAMES[staffId]?.trim() || null;
}

export function StaffCell({ staffId, name, colorHex, className }: StaffCellProps) {
  // The roster lands with the colour cache: re-resolve the name then too.
  useStaffColorVersion();
  const id = staffId && staffId > 0 ? staffId : null;
  const display = staffCellName(id, name);
  if (!id && !display) return null;
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      {/* The ledger mark: colour fill (no photo) + colour ring — as `outbound-orders-ledger-editors` stage cells. */}
      <StaffAvatar staffId={id} name={display} avatarPhotoId={null} colorHex={colorHex} size="xs" colorRing face="record" alt={display ?? undefined} />
      <StaffBadge staffId={id} name={display} colorHex={colorHex} className="min-w-0 truncate" />
    </span>
  );
}
