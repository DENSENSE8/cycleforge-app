/**
 * Client-safe helpers for Unbox notes-composer **Last entry** location.
 * DB fetch lives in {@link ./recent-staged-location-server} (route-only):
 * newest putaway stage on another carton.
 */

export type StagedLocationCandidate = {
  locationId: number;
  lineId: number;
  receivingId: number | null;
  stagedAt: string | null;
  stagedBy: number | null;
  name: string | null;
  barcode: string | null;
  room: string | null;
  rowLabel: string | null;
  colLabel: string | null;
};

export type StagedLocationFace = {
  locationId: number;
  lineId: number;
  receivingId: number | null;
  stagedAt: string | null;
  label: string;
  name: string | null;
  barcode: string | null;
  room: string | null;
  rowLabel: string | null;
  colLabel: string | null;
};

/** Empty notes-footer location pill — current bin unknown. */
export const EMPTY_LOCATION_FACE = 'Location';

/** Operator-facing bin code: barcode first, else room · name, else name. */
export function formatStagedLocationFace(loc: {
  name?: string | null;
  barcode?: string | null;
  room?: string | null;
  rowLabel?: string | null;
  colLabel?: string | null;
}): string {
  const barcode = (loc.barcode || '').trim();
  if (barcode) return barcode;
  const room = (loc.room || '').trim();
  const name = (loc.name || '').trim();
  if (room && name && room !== name) return `${room} · ${name}`;
  if (name) return name;
  const row = (loc.rowLabel || '').trim();
  const col = (loc.colLabel || '').trim();
  if (row && col) return `${row}${col}`;
  if (row) return row;
  return '';
}

/** Location pill face: current bin, or {@link EMPTY_LOCATION_FACE}. */
export function stagedLocationButtonLabel(loc: {
  name?: string | null;
  barcode?: string | null;
  room?: string | null;
  rowLabel?: string | null;
  colLabel?: string | null;
}): string {
  return formatStagedLocationFace(loc) || EMPTY_LOCATION_FACE;
}

/**
 * First eligible staged location from a newest-first list.
 * Skips the open carton; prefers this operator when `staffId` is set.
 */
export function pickRecentStagedLocation(
  candidates: readonly StagedLocationCandidate[],
  opts: { excludeReceivingId?: number | null; staffId?: number | null } = {},
): StagedLocationCandidate | null {
  const exclude =
    opts.excludeReceivingId != null &&
    Number.isFinite(opts.excludeReceivingId) &&
    opts.excludeReceivingId > 0
      ? opts.excludeReceivingId
      : null;
  const staffId =
    opts.staffId != null && Number.isFinite(opts.staffId) && opts.staffId > 0
      ? opts.staffId
      : null;

  const eligible = candidates.filter((c) => {
    if (!(c.locationId > 0)) return false;
    if (exclude != null && c.receivingId === exclude) return false;
    return true;
  });
  if (staffId != null) {
    const mine = eligible.find((c) => c.stagedBy === staffId);
    if (mine) return mine;
  }
  return eligible[0] ?? null;
}

export function toStagedLocationFace(
  row: StagedLocationCandidate,
): StagedLocationFace | null {
  const label = formatStagedLocationFace(row);
  if (!label) return null;
  return {
    locationId: row.locationId,
    lineId: row.lineId,
    receivingId: row.receivingId,
    stagedAt: row.stagedAt,
    label,
    name: row.name,
    barcode: row.barcode,
    room: row.room,
    rowLabel: row.rowLabel,
    colLabel: row.colLabel,
  };
}

/** React Query key — under `receiving` so feed invalidation refreshes Last entry. */
export function recentStagedLocationQueryKey(excludeLineId: number | null | undefined) {
  return ['receiving', 'recent-staged-location', excludeLineId ?? null] as const;
}

/** Menu copy for the recent-bin shortcut, disabled until another PO has a staged bin. */
export function locationControlMenuState(opts: {
  lastLabel: string | null;
  lastLocationId: number | null;
}): {
  hasLast: boolean;
  lastEntryLabel: string;
  lastEntryTitle: string;
} {
  const hasLast =
    opts.lastLocationId != null &&
    Number.isFinite(opts.lastLocationId) &&
    opts.lastLocationId > 0 &&
    Boolean((opts.lastLabel || '').trim());
  const label = (opts.lastLabel || '').trim();
  return {
    hasLast,
    lastEntryLabel: hasLast ? `Last entry · ${label}` : 'Last entry',
    lastEntryTitle: hasLast
      ? `Stage to ${label} from the last PO`
      : 'No recent location from another PO yet',
  };
}
