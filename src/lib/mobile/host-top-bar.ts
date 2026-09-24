/**
 * Which `/m` routes draw their OWN top bar, and therefore which ones the host
 * header (`MobileTopBar`, mounted by `RedesignedMobileShell`) stays off.
 *
 * It lives here rather than inside the shell because TWO components need the
 * same answer and they sit on opposite sides of the children boundary: the
 * shell decides whether to paint its header, and {@link MobileDetailTopBar}
 * decides whether to paint the SCAN seat — which must exist exactly once per
 * screen (`mobile-scan-cta`: *"Scan has ONE door"*). Reading it from one
 * predicate is what makes "exactly once" true by construction instead of by
 * two lists agreeing.
 *
 * This is a DENYLIST on purpose. It replaced an exact-match allowlist of nine
 * paths (2026-08-21), under which every route added since — `/m/identify`,
 * `/m/orders/[orderId]` — silently shipped with no header at all, and therefore
 * no way to start a scan without backing out first. An allowlist fails closed on
 * the routes nobody remembered to add; a denylist fails open, which is the
 * correct default when the thing being withheld is the app's primary action.
 *
 * A trailing slash is load-bearing: `/m/pick/` excludes the pick DETAIL screen
 * (which owns a bar) while `/m/pick` itself still gets the header.
 *
 * PRE-SIGN-IN paths are NOT listed here — `isClientPublicPath` owns those, and
 * they get no shell at all.
 */
export const OWN_TOP_BAR_PREFIXES = [
  '/m/receiving/po',
  '/m/r/',
  '/m/u/',
  '/m/rs/',
  '/m/h/',
  // The ticket thread owns MobileDetailTopBar — the back chevron returns to
  // the checklist row that sent the operator here.
  '/m/t/',
  '/m/b/',
  '/m/pick/',
  '/m/print',
  '/m/id/',
  // Order import owns an X + title bar; a host header above it would stack two
  // chromes on one screen (operator 2026-09-15).
  '/m/orders/sync',
  // Exception records own MobileDetailTopBar; the queue keeps the host bar.
  '/m/exceptions/',
  // The QC line pick (landed from the scan kernel armed for QC) owns its bar.
  '/m/qc/',
] as const;

/**
 * Does this route draw its own top bar — i.e. is the host header withheld?
 *
 * `true` also means the route's own bar carries the scan seat, because nothing
 * above it does. `false` means the host header is up there with the seat in it,
 * and a second one in the record bar would be a duplicate door (operator
 * 2026-09-15, on `/m/pair`: *"remove the scan button from the same header with
 * the text pair location"*).
 */
export function mobileRouteOwnsTopBar(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return OWN_TOP_BAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}
