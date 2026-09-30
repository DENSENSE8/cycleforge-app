import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { getStaffThemeById, stationThemeColors } from '@/utils/staff-colors';
import { cn } from '@/utils/_cn';

interface StaffBadgeProps {
  /** Staff ID — used to resolve the theme color. Null/undefined renders uncolored. */
  staffId: number | null | undefined;
  /** Display name. Defaults to '---' when empty. */
  name?: string | null;
  /** Additional Tailwind classes. */
  className?: string;
}

/**
 * A staff name in their station colour — the ONE staff-name identity every
 * surface wears (stations, shipping, admin, tasks, inbox). Pair it with
 * `StaffAvatar` for the mark. `stationThemeColors[*].text` carries light and
 * dark inks that clear 4.5:1 on card, hover and selected fills.
 */
export function StaffBadge({ staffId, name, className = '' }: StaffBadgeProps) {
  // Re-paint when the staff colour cache lands or an admin recolours someone.
  useStaffColorVersion();
  const display = name?.trim() || '---';
  return <span className={cn(getStaffTextColor(staffId), className)}>{display}</span>;
}

/** The station-colour text class for a staff id (undefined when there is none). */
export function getStaffTextColor(staffId: number | null | undefined): string | undefined {
  if (!staffId) return undefined;
  return stationThemeColors[getStaffThemeById(staffId)].text;
}

/**
 * Initials for an avatar: first letters of the first two words, or the first
 * two characters of a single-word name (so "Thuy" → "TH" and "Tuan" → "TU"
 * stay distinguishable, not both "T").
 */
export function staffInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? '').slice(0, 2).toUpperCase();
}
