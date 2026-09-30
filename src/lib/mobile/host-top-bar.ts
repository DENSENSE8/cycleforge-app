/** Which `/m` routes draw their OWN top bar, and therefore which ones the host header (`MobileTopBar`, mounted by `RedesignedMobileShell`)… */
const OWN_TOP_BAR_PREFIXES = [
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
  // Picks is one screen: the chips head the list, and the walk's scan card
  // (`?order=`) holds its own capture window — the scan seat, exactly once.
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
  '/m/pair/',
  // The package hub (one tracking number) and its doors own MobileDetailTopBar.
  '/m/shipping/shipments/',
  // QC mirrors Picks: the queue's progress bar heads the screen, and the QC
  // line pick (landed from the scan kernel armed for QC) owns its bar.
  '/m/qc',
  // The phone companion to a counter tablet's repair visit wears the
  // exoskeleton (DetailHubScreen) and its /info; both own MobileDetailTopBar.
  '/m/repair-scan',
  // An import run's record owns MobileDetailTopBar (X back to /m/imports); the list keeps the host bar.
  '/m/imports/',
  // A product profile is one record with an X back to the catalog lookup.
  '/m/products/',
] as const;

/**
 * Routes under an {@link OWN_TOP_BAR_PREFIXES} prefix that draw NO bar of their
 * own and so keep the host header: the order intake form sits beside the order
 * hub's `[orderId]` segment.
 */
const HOST_TOP_BAR_KEEPS = ['/m/orders/new'] as const;

/** Does this route draw its own top bar — i.e. */
export function mobileRouteOwnsTopBar(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (HOST_TOP_BAR_KEEPS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return OWN_TOP_BAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}
