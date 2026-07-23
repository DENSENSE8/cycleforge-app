/**
 * Civil-day label for Unbox / History / Testing Date column — activity-axis
 * stamp → PST date key → short cell + medium tooltip (Incoming recipe).
 */

import { formatDateKeyMedium, formatDateKeyShort, toPSTDateKey } from '@/utils/date';

export function receivingActivityDateCell(
  instant: string | null | undefined,
): { label: string; tooltip: string } | null {
  if (!instant) return null;
  const key = toPSTDateKey(instant);
  if (!key || key === 'Unknown') return null;
  return {
    label: formatDateKeyShort(key),
    tooltip: formatDateKeyMedium(key, { weekday: 'short', withYear: true }),
  };
}
