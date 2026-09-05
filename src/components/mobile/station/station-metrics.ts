/**
 * Sizes the mobile stations share.
 *
 * These were hand-picked bracket literals inside `MobileCaptureWindow`
 * (`h-[46svh] min-h-[19rem]`) — undocumented magic numbers in the file every
 * cloned floor station inherits its sizing from. Named here so a station reads
 * a decision rather than copying a number.
 */

/**
 * How tall a station's capture sheet stands while open.
 *
 * `46svh` is not a taste call. It is what puts the FOCUS ITEM — the thing that
 * just happened — at the vertical middle of the screen, where the eye already
 * is, rather than down by the thumb. Shorter and the focus item sinks; taller
 * and the tape stops being readable behind it.
 *
 * `svh`, not `vh`: on a phone `vh` is the *largest* viewport, so with the
 * browser chrome showing, a `vh`-sized sheet pushes its own lip under the fold
 * and the header above it off-screen. `min-h` is the floor for pre-Safari-15.4
 * engines that do not know `svh` at all — they drop the first declaration and
 * would otherwise render an auto-height sheet with no height at all.
 */
export const STATION_SHEET_HEIGHT_CLASS = 'h-[46svh] min-h-[19rem]';
