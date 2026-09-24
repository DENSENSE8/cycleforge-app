import { formatDateKeyShort } from '@/utils/date';

/**
 * The record's ship-by face — the date itself, no `SHIP BY` / `SHIP` prefix
 * (owner 2026-09-24). Late keeps a day count beside the date (`SEP 11 · 13d`)
 * so lateness is never colour alone. Desk ledger and phone record both read it.
 */
export function formatShipByFace(dateKey: string | null | undefined, overdueDays: number): string {
  const key = (dateKey ?? '').trim();
  if (!key) return '—';
  const date = formatDateKeyShort(key);
  return overdueDays > 0 ? `${date} · ${overdueDays}d` : date;
}
