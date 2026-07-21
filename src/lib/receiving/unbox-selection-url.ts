/**
 * Unbox focused-carton URL SoT — `?openReceivingId=` (+ optional `?lineId=`).
 *
 * Mirrors dashboard `?openOrderId=`: write on workspace open, clear on close,
 * so a hard refresh reopens the edit overlay instead of the browse crossfade.
 * Share / inbox still use `?recvId=` via `openInUnboxHref`; this helper strips
 * stray `recvId` when syncing so one session SoT wins.
 */

/**
 * Mutates `params` in place. Pass `null` to clear the focused-carton params.
 * Preserves unrelated keys (`unboxview`, `ticketView`, …).
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
 * Whether the `?openReceivingId=` deep-link restore should run for this surface.
 *
 * `openReceivingId` is the Unbox surface's focused-carton URL SoT — written only
 * on `/unbox` (see `applyUnboxOpenReceivingParams` / the workspace-pane write
 * side), and every search / deep-link href targets `/unbox?openReceivingId=`. A
 * stale value that rides a mode switch onto Incoming/Triage/etc. must NOT trigger
 * a restore: the restore's `dispatchSelectLine` is caught by the Incoming
 * overlays listener and pops the details panel on load (the click-to-open
 * regression). Gating the READ on `isUnboxSurface` keeps it symmetric with the
 * Unbox-only WRITE side, so no other surface restores from a param it never wrote.
 */
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
