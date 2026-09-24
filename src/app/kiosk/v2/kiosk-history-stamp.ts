/**
 * How History prints an instant: **time first, then the date.**
 *
 * Callers: `KioskHistoryRail`, `KioskHistoryDetail`. Affected API: none.
 * Schemas: none — it takes the already-PST-normalized
 * `YYYY-MM-DD HH:MM:SS` string every counter reader returns.
 * User 2026-09-23: *"extremely simple — time first then date. It should display
 * 26 not 2026. The dates should be including slashes not dashes."*
 *
 * `1:56 PM · 9/17/26`.
 *
 * Time leads because the counter's question is nearly always about today: the
 * hour separates this morning's drop-offs from each other, and the date only
 * separates today from last month. Seconds are gone, the century is gone, and
 * leading zeros are gone — every character that survived is one the operator
 * reads.
 *
 * ## Why this is string surgery and not `Date`
 *
 * `normalizePSTTimestamp` has ALREADY resolved the zone; the string is the
 * answer. Re-parsing it into a `Date` re-applies the runtime's zone — on a
 * tablet set to anything but America/Los_Angeles that silently shifts every
 * drop-off time on the face. So this never constructs a `Date`: it splits the
 * string it was given and renders the same wall clock back.
 */

const HOURS_PER_MERIDIEM = 12;

/**
 * The clock half, alone: `1:56 PM`, or `''` when the string carries no time.
 *
 * This is what a row under a DAY BAND prints. The band already says which day
 * the rows below it belong to, so repeating `9/17/26` down forty rows spends
 * the operator's reading on the one fact that does not change inside the group
 * — the same redundancy the ticket number was printing three times.
 */
export function kioskHistoryTime(raw: string | null | undefined): string {
  const [, timePart] = (raw ?? '').trim().split(/[ T]/, 2);
  if (!timePart) return '';
  const [hourRaw, minute] = timePart.split(':');
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour) || !minute) return '';
  const meridiem = hour >= HOURS_PER_MERIDIEM ? 'PM' : 'AM';
  const hour12 = hour % HOURS_PER_MERIDIEM === 0 ? HOURS_PER_MERIDIEM : hour % HOURS_PER_MERIDIEM;
  return `${hour12}:${minute} ${meridiem}`;
}

export function kioskHistoryStamp(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '—';

  const [datePart] = value.split(/[ T]/, 2);
  const [year, month, day] = (datePart ?? '').split('-');
  const date =
    year && month && day
      ? `${Number(month)}/${Number(day)}/${year.slice(-2)}`
      : (datePart ?? value);

  const time = kioskHistoryTime(value);
  return time ? `${time} · ${date}` : date;
}
