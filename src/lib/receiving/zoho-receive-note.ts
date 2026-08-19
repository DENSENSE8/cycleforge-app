import { formatPSTTimestamp } from '@/utils/date';
import { STAFF_NAMES } from '@/utils/staff';

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Actor name for Zoho PO notes. Never `Staff #N` — Zoho notes are operator-facing.
 * Prefer the staff row name, then the known display map, then Unknown.
 */
export function zohoReceiveStaffName(
  dbName: string | null | undefined,
  staffId: number | null | undefined,
): string {
  const fromDb = String(dbName ?? '').trim();
  if (fromDb) return fromDb;
  if (staffId != null && Number.isFinite(staffId) && staffId > 0) {
    const mapped = STAFF_NAMES[staffId];
    if (mapped) return mapped;
  }
  return 'Unknown';
}

/** `{Name} · scanned {pst} · unboxed {pst}` — omit a clause when that stamp is missing. */
export function buildZohoReceiveNoteLine(params: {
  staffName: string;
  scannedAt?: Date | string | null;
  unboxedAt?: Date | string | null;
}): string {
  const name = zohoReceiveStaffName(params.staffName, null);
  const parts = [name];
  const scan = asDate(params.scannedAt);
  const unbox = asDate(params.unboxedAt);
  if (scan) parts.push(`scanned ${formatPSTTimestamp(scan)}`);
  if (unbox) parts.push(`unboxed ${formatPSTTimestamp(unbox)}`);
  return parts.join(' · ');
}
