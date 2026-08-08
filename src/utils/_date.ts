/**
 * Generic date formatting utilities.
 * For PST-specific formatting, use the dedicated PST functions in `./date.ts`.
 */

/**
 * Formats a date as "Jan 18, 2026" (short month, numeric day, numeric year).
 * Returns the fallback string for null/invalid input.
 */
export function formatMediumDate(
  value: string | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Returns a relative time string.
 * @example timeAgo(Date.now() - 60000) → '1 minute ago'
 */
export function timeAgo(date: Date | string | number): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const intervals: [number, string][] = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count !== 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

