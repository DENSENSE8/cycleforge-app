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
 * A trailing slash is load-bearing where the bare path is a queue that keeps
 * the header while its records own a bar (`/m/exceptions/` vs `/m/exceptions`).
 * `/m/pick` has no queue: the bare route IS the directed pick session and
 * draws its own progress band.
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
  // The scanned location record owns MobileDetailTopBar (X back to /m/scan).
  '/m/loc/',
  // The scanned FBA label record owns MobileDetailTopBar (X back to /m/scan).
  '/m/fnsku/',
  '/m/pick',
  '/m/id/',
  // The order hub and its doors own MobileDetailTopBar (X back to the job);
  // order import (`/m/orders/sync`) owns an X + title bar. A host header above
  // either would stack two chromes on one screen (operator 2026-09-15).
  '/m/orders/',
  // Exception records own MobileDetailTopBar; the queue keeps the host bar.
  '/m/exceptions/',
  // Pairing a location (search, then the count keypad) owns its back bar
  // (operator 2026-09-25: "the back button would cover the header … two
  // headers, the back button and the search bar"). This reverses the
  // 2026-09-15 host-header ruling: the seat now rides the pair bar, once.
  '/m/pair/',
  // The package hub (one tracking number) and its doors own MobileDetailTopBar.
  '/m/shipping/shipments/',
  // The QC line pick (landed from the scan kernel armed for QC) owns its bar.
  '/m/qc/',
  // The phone companion to a counter tablet's repair visit wears the
  // exoskeleton (DetailHubScreen) and its /info; both own MobileDetailTopBar.
  '/m/repair-scan',
] as const;

/**
 * Routes under an {@link OWN_TOP_BAR_PREFIXES} prefix that draw NO bar of their
 * own and so keep the host header: the order intake form sits beside the order
 * hub's `[orderId]` segment.
 */
const HOST_TOP_BAR_KEEPS = ['/m/orders/new'] as const;

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
  if (HOST_TOP_BAR_KEEPS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return OWN_TOP_BAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}
