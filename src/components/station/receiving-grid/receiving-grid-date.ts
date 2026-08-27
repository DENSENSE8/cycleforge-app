/**
 * Activity-axis Date cell for Unbox / History / Testing — civil day on the
 * face (`Aug 6`), simple day + time on hover. Stage / staff biography stays
 * on the row inspector (click the row) — not the tip.
 */

import {
  formatDateKeyMedium,
  formatDateKeyShort,
  formatTime12hPST,
  toPSTDateKey,
} from '@/utils/date';

export function receivingActivityDateCell(
  instant: string | null | undefined,
): { label: string; tooltip: string } | null {
  if (!instant) return null;
  const key = toPSTDateKey(instant);
  if (!key || key === 'Unknown') return null;
  const time = formatTime12hPST(instant);
  if (!time || time === '--:--') return null;
  const day = formatDateKeyMedium(key, { weekday: 'short', withYear: true });
  return {
    label: formatDateKeyShort(key),
    tooltip: `${day} · ${time}`,
  };
}
