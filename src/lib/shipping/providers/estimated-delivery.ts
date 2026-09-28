/**
 * Carrier ETA → ISO instant. Date-only values (USPS `2026-09-30`, UPS
 * `20260930`) pin to 12:00Z so the calendar day survives any US time zone.
 */
export function estimatedDeliveryInstant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const dateOnly = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00.000Z`;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
