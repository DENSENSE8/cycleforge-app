/** Unbox focused-carton URL SoT — `?openReceivingId=` (+ optional `?lineId=`). */

/** Desk mode — workbench tables. Absent = station (scan bench). */
const UNBOX_DESK_PARAM = 'unboxdesk';

/**
 * Mutates `params` in place. Pass `null` to clear the focused-carton params.
 * Preserves unrelated keys (`unboxview`, `ticketView`, `claimView`, …).
 */
export function applyUnboxOpenReceivingParams(
  params: URLSearchParams,
  selection: { receivingId: number; lineId?: number | null } | null,
): void {
  if (selection == null) {
    params.delete('openReceivingId');
    params.delete('lineId');
    params.delete('recvId');
    return;
  }

  const receivingId = Number(selection.receivingId);
  if (!Number.isFinite(receivingId) || receivingId <= 0) {
    params.delete('openReceivingId');
    params.delete('lineId');
    params.delete('recvId');
    return;
  }

  params.set('openReceivingId', String(receivingId));
  // Session SoT is openReceivingId — drop share-style recvId so restore has one path.
  params.delete('recvId');

  const lineId = selection.lineId != null ? Number(selection.lineId) : null;
  if (lineId != null && Number.isFinite(lineId) && lineId > 0) {
    params.set('lineId', String(lineId));
  } else {
    params.delete('lineId');
  }
}

/**
 * Desk flag — `?unboxdesk=1` keeps Back to list from immediately re-opening MRU.
 * Opening a carton / resume / scan must clear it.
 */
export function applyUnboxDeskParam(params: URLSearchParams, desk: boolean): void {
  if (desk) params.set(UNBOX_DESK_PARAM, '1');
  else params.delete(UNBOX_DESK_PARAM);
}

export function isUnboxDesk(
  searchParams: Pick<URLSearchParams, 'get'>,
): boolean {
  const raw = String(searchParams.get(UNBOX_DESK_PARAM) || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true';
}

/** Station-first cold land: */
export function shouldAutoOpenUnboxMru(
  isUnboxSurface: boolean,
  searchParams: Pick<URLSearchParams, 'get'>,
  deskHeld = false,
): boolean {
  if (!isUnboxSurface) return false;
  if (deskHeld) return false;
  if (isUnboxDesk(searchParams)) return false;
  const open = searchParams.get('openReceivingId');
  if (open && /^\d+$/.test(open)) return false;
  return true;
}

/** Whether the `?openReceivingId=` deep-link restore should run for this surface. */
export function shouldRestoreOpenReceiving(
  isUnboxSurface: boolean,
  openReceivingId: string | null,
): boolean {
  return isUnboxSurface && !!openReceivingId && /^\d+$/.test(openReceivingId);
}

/**
 * Prefer `lineId` among carton lines when restoring `?openReceivingId=`; fall
 * back to the first line (cmd+k / search carton-only deep links).
 */
export function pickReceivingLineForDeepLink<T extends { id: number }>(
  rows: readonly T[],
  lineIdParam: string | null,
): T | undefined {
  if (rows.length === 0) return undefined;
  if (lineIdParam && /^\d+$/.test(lineIdParam)) {
    const lineId = Number(lineIdParam);
    const match = rows.find((r) => r.id === lineId);
    if (match) return match;
  }
  return rows[0];
}
