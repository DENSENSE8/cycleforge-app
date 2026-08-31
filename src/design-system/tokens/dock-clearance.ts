/**
 * Floating-dock bottom clearance — ONE value for every floating composer /
 * action dock that sits on the bottom edge of a station column.
 *
 * The Unbox notes dock (centre) and the Ticket Displays composer (right edge)
 * are two floating cards on two adjacent columns, so their bottom gaps read
 * against each other. They must resolve the same clearance from here — never a
 * page-local `pb-*` beside one of them.
 *
 * Kept tight on purpose (2026-08-30): the mode picker + procedure ring sit
 * BELOW the composer outline as a caption row — a fat bottom pad left a dead
 * band between that row and the screen edge. Safe-area still wins on a phone
 * home indicator; desktop benches go nearly flush.
 */
export const FLOATING_DOCK_BOTTOM_PAD =
  'pb-[max(0.25rem,env(safe-area-inset-bottom))]';
