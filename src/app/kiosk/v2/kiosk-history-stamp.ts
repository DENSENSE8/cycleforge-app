/** How History prints an instant: */

const HOURS_PER_MERIDIEM = 12;

/** The clock half, alone: */
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
