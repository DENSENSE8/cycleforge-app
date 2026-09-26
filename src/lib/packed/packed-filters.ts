/** Packed-tab URL facets — staff is `?staff=`; packed-at window is `?dateFrom=` / `?dateTo=` (civil YYYY-MM-DD, warehouse zone). */

import {
  computeWeekRange,
  dateKeyFromParts,
  formatDateKeyShort,
  formatWeekRangeCompact,
  getCurrentPSTDateKey,
  getRollingDaysStartKey,
  getYesterdayPSTDateKey,
  isDateKey,
  parseDateKey,
  toPSTDateKey,
} from '@/utils/date';

const PACKED_DATE_FROM_PARAM = 'dateFrom';
const PACKED_DATE_TO_PARAM = 'dateTo';
/** Intentional "no date window" — dismiss / Clear; blocks current-week seed. */
const PACKED_ALL_DATES_PARAM = 'allDates';

export function parsePackedDateKey(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!isDateKey(value) || !parseDateKey(value)) return null;
  return value;
}

export function packedAllDatesActive(raw: string | null | undefined): boolean {
  const value = String(raw || '').trim().toLowerCase();
  return value === '1' || value === 'true';
}

/** Sunday–Saturday warehouse week containing today (offset 0). */
export function packedCurrentWeekKeys(todayKey = getCurrentPSTDateKey()): {
  dateFrom: string;
  dateTo: string;
} {
  const week = computeWeekRange(0, todayKey);
  return { dateFrom: week.startStr, dateTo: week.endStr };
}

/**
 * True when the desk should write the current-week window into the URL
 * (Packed landing with neither an explicit range nor an intentional clear).
 */
export function packedShouldSeedCurrentWeek(args: {
  dateFrom: string | null;
  dateTo: string | null;
  allDates: boolean;
}): boolean {
  return !args.allDates && !args.dateFrom && !args.dateTo;
}

function packedAtMatchesRange(
  packedAt: string | Date | null | undefined,
  fromKey: string | null,
  toKey: string | null,
): boolean {
  if (!fromKey && !toKey) return true;
  const day = toPSTDateKey(packedAt);
  if (!day) return false;
  if (fromKey && day < fromKey) return false;
  if (toKey && day > toKey) return false;
  return true;
}

export function packedFiltersHot(args: {
  staffId: number | null;
  dateFrom: string | null;
  dateTo: string | null;
}): boolean {
  return Boolean(args.staffId || args.dateFrom || args.dateTo);
}

/** Glanceable packed-at window — matches DateRangePickerField presets (Today / This week / Last 7 days / Last 30 days / This month) when… */
export function packedDateWindowLabel(
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  todayKey = getCurrentPSTDateKey(),
): string | null {
  if (!dateFrom && !dateTo) return null;
  const from = dateFrom ?? dateTo ?? '';
  const to = dateTo ?? dateFrom ?? '';
  if (!from || !to) return null;
  if (from === to) {
    if (from === todayKey) return 'Today';
    if (from === getYesterdayPSTDateKey(todayKey)) return 'Yesterday';
    return formatDateKeyShort(from) || from;
  }
  const week = packedCurrentWeekKeys(todayKey);
  if (from === week.dateFrom && to === week.dateTo) return 'This week';
  if (to === todayKey) {
    if (from === getRollingDaysStartKey(7, todayKey)) return 'Last 7 days';
    if (from === getRollingDaysStartKey(30, todayKey)) return 'Last 30 days';
    const parts = parseDateKey(todayKey);
    if (parts && from === dateKeyFromParts(parts.y, parts.m, 1)) return 'This month';
  }
  const fromLabel = formatDateKeyShort(from) || from;
  const toLabel = formatDateKeyShort(to) || to;
  return `${fromLabel}–${toLabel}`;
}

/**
 * Exact civil window for the find-field trailing cluster — same compact form
 * as the History / sheet week pill (`MAY 12th - 16th`), never a soft preset name.
 * Same-day windows collapse to a single ordinal.
 */
export function packedDateExactLabel(
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
): string | null {
  if (!dateFrom && !dateTo) return null;
  const from = dateFrom ?? dateTo ?? '';
  const to = dateTo ?? dateFrom ?? '';
  if (!from || !to) return null;
  if (from === to) {
    return formatWeekRangeCompact(from, '') || from;
  }
  return formatWeekRangeCompact(from, to) || `${from}–${to}`;
}

export function packedFiltersHotLabel(args: {
  staffName: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  todayKey?: string;
  exactDates?: boolean;
}): string | undefined {
  const parts: string[] = [];
  if (args.staffName) parts.push(args.staffName);
  const window = args.exactDates
    ? packedDateExactLabel(args.dateFrom, args.dateTo)
    : packedDateWindowLabel(args.dateFrom, args.dateTo, args.todayKey);
  if (window) parts.push(window);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Row facts the Packed KPI / export count from — one package = one shipment (else the order). */
interface PackedCountRow {
  id: number;
  shipment_id?: number | string | null;
  packed_by?: number | null;
  packer_id?: number | null;
  packed_by_name?: string | null;
  packer_name?: string | null;
}

function packedPackageKey(row: PackedCountRow): string {
  const ship = row.shipment_id == null ? '' : String(row.shipment_id).trim();
  return ship ? `s:${ship}` : `o:${row.id}`;
}

function packedStaffId(row: PackedCountRow): number | null {
  const id = row.packed_by ?? row.packer_id ?? null;
  return id != null && id > 0 ? id : null;
}

function packedStaffName(row: PackedCountRow): string {
  const named = String(row.packed_by_name || row.packer_name || '').trim();
  if (named) return named;
  const id = packedStaffId(row);
  return id != null ? `#${id}` : 'Unassigned';
}

interface PackedStaffPackageCount {
  staffId: number | null;
  name: string;
  packages: number;
}

interface PackedFilterSummary {
  packages: number;
  orders: number;
  byStaff: PackedStaffPackageCount[];
}

/** Package counts for the filtered Packed sheet — drives Band 2. */
function summarizePackedFilter(rows: readonly PackedCountRow[]): PackedFilterSummary {
  const allPackages = new Set<string>();
  const byStaff = new Map<string, { staffId: number | null; name: string; packages: Set<string> }>();
  for (const row of rows) {
    const pkg = packedPackageKey(row);
    allPackages.add(pkg);
    const staffId = packedStaffId(row);
    const mapKey = staffId != null ? String(staffId) : 'none';
    let bucket = byStaff.get(mapKey);
    if (!bucket) {
      bucket = { staffId, name: packedStaffName(row), packages: new Set() };
      byStaff.set(mapKey, bucket);
    }
    bucket.packages.add(pkg);
  }
  return {
    packages: allPackages.size,
    orders: rows.length,
    byStaff: [...byStaff.values()]
      .map((bucket) => ({
        staffId: bucket.staffId,
        name: bucket.name,
        packages: bucket.packages.size,
      }))
      .sort((a, b) => b.packages - a.packages || a.name.localeCompare(b.name)),
  };
}

/** Staff who packed at least one package in `rows` — picker roster, never a zero-pack person. */
export function packedStaffFilterOptions(
  rows: readonly PackedCountRow[],
): Array<{ value: number; label: string }> {
  return summarizePackedFilter(rows)
    .byStaff.filter((bucket) => bucket.staffId != null && bucket.packages > 0)
    .map((bucket) => ({ value: bucket.staffId as number, label: bucket.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

