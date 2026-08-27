/**
 * Floating-dock bottom clearance — ONE value for every floating composer /
 * action dock that sits on the bottom edge of a station column.
 *
 * The Unbox notes dock (centre) and the Ticket Displays composer (right edge)
 * are two floating cards on two adjacent columns, so their bottom gaps read
 * against each other. They must resolve the same clearance from here — never a
 * page-local `pb-*` beside one of them.
 *
 * Safe-area aware: `max()` keeps the card off a device home indicator without
 * inflating the gap on a desktop bench.
 */
export const FLOATING_DOCK_BOTTOM_PAD = 'pb-[max(1rem,env(safe-area-inset-bottom))]';
