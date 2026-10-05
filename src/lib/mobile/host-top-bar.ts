/** Which `/m` routes draw their own bar instead of the `MobileV2TopBar` mounted by `MobileV2Shell`. */
const OWN_TOP_BAR_PREFIXES = [
  // The scan station owns its mode switch, exit semantics and camera state.
  // The host's generic scan CTA was a duplicate "new scan" button.
  '/m/scan',
  // Prepack owns its wordless four-segment progress bar and Back row.
  '/m/prepack',
  '/m/receiving/po',
  // Adding purchase orders (the door list and the inbound-order form) owns MobileV2DetailTopBar (X back).
  '/m/receiving/new',
  '/m/receiving/order',
  // Bulk purchase-order CSV upload owns MobileV2DetailTopBar (X back to /m/receiving/new).
  '/m/receiving/import-csv',
  // Printing location labels (Rack → Shelves → Print) owns MobileV2DetailTopBar (X back to /m/racks).
  '/m/stock/labels',
  // Location / bay labels (scan or pick the address → print) owns MobileV2DetailTopBar and its own capture window.
  '/m/labels',
  // New rack (Place → Shelves → Review → Print) owns MobileV2DetailTopBar (X back to /m/racks); the list keeps the host bar.
  '/m/racks/new',
  '/m/r/',
  '/m/u/',
  '/m/rs/',
  '/m/h/',
  // The ticket thread owns MobileV2DetailTopBar — the back chevron returns to
  // the checklist row that sent the operator here.
  '/m/t/',
  // The scanned location record owns MobileV2DetailTopBar (X back to /m/scan).
  '/m/loc/',
  // The scanned FBA label record owns MobileV2DetailTopBar (X back to /m/scan).
  '/m/fnsku/',
  // Picks is one screen: the chips head the list, and the walk's scan card
  // (`?order=`) holds its own capture window — the scan seat, exactly once.
  '/m/pick',
  '/m/id/',
  // The order hub and its doors own MobileV2DetailTopBar (X back to the job);
  // order import (`/m/orders/sync`) owns an X + title bar. A host header above
  // either would stack two chromes on one screen (operator 2026-09-15).
  '/m/orders/',
  // Exception records own MobileV2DetailTopBar; the queue keeps the host bar.
  '/m/exceptions/',
  // Pairing a location (search, then the count keypad) owns its back bar
  // (operator 2026-09-25: "the back button would cover the header … two
  '/m/pair/',
  // The package hub (one tracking number) and its doors own MobileV2DetailTopBar.
  '/m/shipping/shipments/',
  // QC mirrors Picks: the queue's progress bar heads the screen, and the QC
  // line pick (landed from the scan kernel armed for QC) owns its bar.
  '/m/qc',
  // The phone companion to a counter tablet's repair visit wears the
  // exoskeleton (DetailHubScreen) and its /info; both own MobileV2DetailTopBar.
  '/m/repair-scan',
  // An import run's record owns MobileV2DetailTopBar (X back to /m/imports); the list keeps the host bar.
  '/m/imports/',
  // A product profile is one record with an X back to the catalog lookup.
  '/m/products/',
  // Customer records own MobileV2DetailTopBar; the directory keeps the host bar.
  '/m/customers/',
  // Support: the list mounts the host bar itself (MobileV2TopBar) and the record on the same route
  // (`?item=`) draws MobileV2DetailTopBar (X back to the list) — ownership cannot read the query.
  '/m/support',
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
