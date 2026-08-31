/**
 * Floating-dock bottom clearance — ONE value for every floating composer /
 * action dock that sits on the bottom edge of a station column.
 *
 * The Unbox notes dock (centre) and the Ticket Displays composer (right edge)
 * are two floating cards on two adjacent columns, so their bottom gaps read
 * against each other. They must resolve the same clearance from here — never a
 * page-local `pb-*` beside one of them.
 *
 * The station composer HOST paints a flat canvas floor (modes sit on it) and
 * owns the pad inside that fill. A pad on this wrapper was a transparent slit
 * that showed the recents rail through Unbox | Ticket.
 */
export const FLOATING_DOCK_BOTTOM_PAD =
  'pb-[env(safe-area-inset-bottom)]';
