/**
 * Sizes the mobile stations share.
 *
 * These were hand-picked bracket literals inside `MobileCaptureWindow`
 * (`h-[46svh] min-h-[19rem]`) — undocumented magic numbers in the file every
 * cloned floor station inherits its sizing from. Named here so a station reads
 * a decision rather than copying a number.
 */

/**
 * How tall a station's bottom camera panel stands while it is up — HEADER
 * INCLUDED.
 *
 * `46svh` is not a taste call. It is what puts the FOCUS ITEM — the thing that
 * just happened — at the vertical middle of the screen, where the eye already
 * is, rather than down by the thumb. Shorter and the focus item sinks; taller
 * and the tape stops being readable behind it.
 *
 * The panel's control row is INSIDE this height, not added to it: the header
 * arrived in 2026-09 and paying for it out of the stage is what kept the focus
 * item on the same pixel it has held all along.
 *
 * `svh`, not `vh`: on a phone `vh` is the *largest* viewport, so with the
 * browser chrome showing, a `vh`-sized panel pushes its own lip under the fold
 * and the header above it off-screen. `min-h` is the floor for pre-Safari-15.4
 * engines that do not know `svh` at all — they drop the first declaration and
 * would otherwise render an auto-height panel with no height at all.
 */
export const STATION_CAMERA_PANEL_HEIGHT_CLASS = 'h-[46svh] min-h-[19rem]';

/**
 * The camera panel's control row: leading control · status · Done.
 *
 * 36px — the `row` rung of MOBILE_CONTROL_LADDER, and the shortest band that
 * can hold a 28px glyph button and a 32px text button without either one
 * touching an edge. Paint is 36; both controls carry the rest of their 44px hit
 * region on a pseudo-element, so the row stays short while the thumb does not.
 *
 * Short is the whole point. This row exists to get the station's controls OFF
 * the live feed, and a band that grows is a band that starts eating the picture
 * it was meant to keep clean.
 */
export const STATION_CAMERA_HEADER_HEIGHT_CLASS = 'h-9';

/**
 * How tall a station's non-camera bottom sheet stands — the location-bind
 * surface, which takes the camera panel's slot while it is up.
 *
 * Deliberately the same value: `MobileScanIdentify` swaps one for the other in
 * the SAME slot of `MobileStationShell`, so a different height there would make
 * the tape jump every time a bin scan opened the bind surface.
 */
export const STATION_SHEET_HEIGHT_CLASS = STATION_CAMERA_PANEL_HEIGHT_CLASS;
