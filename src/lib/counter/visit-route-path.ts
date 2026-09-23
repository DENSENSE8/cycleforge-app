/**
 * `/api/kiosk/visit/{id}/…` → the visit id.
 *
 * Callers: every device-authed visit route (receipt · detail · edit ·
 * label-printed). Affected API: none of its own. Schemas: none.
 *
 * Why a helper and not `params`: `withKioskAuth` replaces Next's route context
 * with the device `KioskAuthContext`, so a handler under it never receives
 * `params`. Each route re-deriving the id from the pathname is the same parse
 * written four times — and four chances to accept `visit/0` or `visit/abc`.
 */
export function visitIdFromPath(pathname: string): number | null {
  const segments = pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('visit');
  if (at === -1) return null;
  const id = Number(segments[at + 1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
