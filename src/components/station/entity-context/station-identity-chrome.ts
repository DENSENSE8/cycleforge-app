/**
 * Station identity chrome — coplanar flush band under GlobalHeader.
 *
 * Identity sits **flush under GlobalHeader** on the sunken work plane: square
 * all sides, hairline bottom seam only, no elevation. {@link STATION_WORKBENCH_COLUMN}
 * (edge-to-edge of the center column; Displays locks the column at 720 when
 * open) paints an opaque **white card face** (`bg-surface-card`) so carton
 * context, PO lines, and the notes dock share one measure — no `mx-auto`
 * sunken gutters. Icon gap matches GlobalHeader via {@link HEADER_ICON_GAP}.
 *
 * ## Top inset SoT
 *
 * {@link STATION_IDENTITY_INSET_TOP} (`top-0`) pins identity + more-details
 * under the header. {@link STATION_IDENTITY_INSET_RIGHT} (`right-2`) keeps the
 * trailing utility cluster off the right edge. Never stack host `py-*` under
 * this float. Inner pad is zero — content abuts the band edges.
 *
 * Mid-canvas right-edge jumps live on `StationRightEdgeAction` (sibling module)
 * — flush-right sliced tab, not the top identity strip.
 */
import {
  HEADER_ICON_GAP,
  PRIMARY_CHROME_ROW_FACE,
  STATION_SECONDARY_BAND_FACE,
} from '@/components/layout/header-shell';
import { elevationClass } from '@/design-system/tokens/shadows';

/** Flat plane — no lift on the identity band. */
const STATION_IDENTITY_ELEVATION = elevationClass('flat');

/** Absolute identity host — flush under GlobalHeader. */
export const STATION_IDENTITY_INSET_TOP = 'top-0';

/** Trailing inset for more-details / corner utilities. */
export const STATION_IDENTITY_INSET_RIGHT = 'right-2';

/**
 * Absolute float host for {@link StationContextBar} — click-through outer;
 * children re-enable with `pointer-events-auto`. Pairs with
 * {@link STATION_IDENTITY_STACKED_SCROLL_CLEARANCE} on the workbench body.
 */
export const stationContextBarHostClass =
  `pointer-events-none absolute inset-x-0 ${STATION_IDENTITY_INSET_TOP} z-raised`;

/**
 * In-flow host for {@link StationContextBar} — identity is a shrink-0 sibling
 * above the workbench scroll port so the hairline bottom abuts PO lines with
 * **zero** guessed `pt-*` clearance. Use with
 * `StationWorkbench reserveIdentityClearance={false}`.
 */
export const stationContextBarFlowHostClass = 'relative shrink-0';

/**
 * Identity strip — coplanar flush white face on the locked 720 measure: square
 * all sides, hairline bottom only, opaque card fill (same plane as PO lines).
 * Compose with `STATION_WORKBENCH_COLUMN` — do not paint this on a
 * full-bleed host.
 */
export const stationIdentityPanelClass =
  `rounded-none border-0 border-b border-border-soft bg-surface-card ${STATION_IDENTITY_ELEVATION}`;

/**
 * Top-right utilities shell — same flush white recipe as the identity strip.
 */
export const stationUtilityPanelClass =
  `rounded-none border-0 border-b border-border-soft bg-surface-card ${STATION_IDENTITY_ELEVATION}`;

/**
 * Inner pad for flush identity / utility faces — zero on all sides so
 * GlobalHeader → identity → body read as one floor with no side air.
 */
export const stationIdentityPadClass = 'px-0';

/* ── Two-row identity rhythm ──────────────────────────────────────────────── */

/**
 * Station chrome seam — alias of {@link PRIMARY_CHROME_ROW_FACE} (28px scan bar
 * · carton identity row 1 · Displays push top). Identity rows + Displays
 * header lock to this so the hairline reads as one continuous line across the
 * station. **Not** the GlobalHeader / spine top band (`TOP_CHROME_ROW_FACE` /
 * 40px) — that seam sits above this one.
 */
export const STATION_CHROME_ROW_FACE = PRIMARY_CHROME_ROW_FACE;

/**
 * Bottom hairline on a station chrome row — painted via `after:` so it does
 * **not** eat the `h-7` / `h-6` box (border-box `border-b` would shrink the
 * fill) and does **not** notch a parent `border-l` (Displays seam). Same token
 * as Displays top band · identity row 1 · leaf eyebrows.
 */
export const STATION_CHROME_SEAM_HAIRLINE =
  'relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border-hairline';

/**
 * Chip-to-chip step on chrome row 1 (classify · Photos) — flush (zero gap),
 * locked to {@link STATION_CHROME_ROW_FACE}. Classify urgency·platform·type
 * uses the same flush abut as Photos ({@link STATION_IDENTITY_GROUP_CLASS}).
 * Never reintroduce `row-gap` / `row-tight` air tokens for identity chrome.
 * Bottom seam = {@link STATION_CHROME_SEAM_HAIRLINE} (matches Displays top band).
 */
export const STATION_IDENTITY_ROW_CLASS = `flex ${STATION_CHROME_ROW_FACE} items-stretch gap-0 ${STATION_CHROME_SEAM_HAIRLINE}`;

/**
 * Commerce row 2 face — same {@link STATION_SECONDARY_BAND_FACE} (`h-6`) as the
 * left-rail eyebrow (pencil) and Displays VERIFICATION group header. Not the
 * scan-bar chrome seam (that is row 1 / {@link STATION_CHROME_ROW_FACE}).
 */
const STATION_IDENTITY_COMMERCE_ROW_FACE = STATION_SECONDARY_BAND_FACE;

/** Chip-to-chip step on commerce row 2 — flush, locked to the commerce face. */
export const STATION_IDENTITY_COMMERCE_ROW_CLASS = `flex ${STATION_IDENTITY_COMMERCE_ROW_FACE} items-stretch gap-0`;

/**
 * Classify urgency·platform·type — **one token**: flush abut (`gap-0`) +
 * overlapping side borders (`-ml-px` on every pill after the first) so the
 * double-hairline seam between tone faces does not read as air. Same grammar
 * as Photos · Claim. Soft drop shadows live off these faces (`shadow-none` on
 * the tone SoTs); never reintroduce `gap-1.5` spacing between classify pills.
 *
 * Sibling overlap targets `[data-inline-pill]` hosts from {@link InlinePillPicker}.
 */
export const STATION_IDENTITY_GROUP_CLASS =
  'flex h-full min-h-0 items-stretch gap-0 [&>[data-inline-pill]+[data-inline-pill]]:-ml-px';

/** Vertical step between the two rows — flush (zero gap). */
export const STATION_IDENTITY_ROW_STACK_CLASS = 'flex flex-col gap-0';

/**
 * Leading column on chrome row 1 — boxed exit chevron so classify pills
 * share one x with the exit face. Square track on {@link STATION_CHROME_ROW_FACE};
 * child fills flush (`h-full w-full`). Row 2 status is a content-width pill.
 */
export const STATION_IDENTITY_LEAD_COL_CLASS =
  'flex h-full aspect-square shrink-0 items-stretch justify-stretch';

/** Gap between icons / chips — same integer as GlobalHeader. */
export const stationIdentityGapClass = HEADER_ICON_GAP;

/**
 * More-details inside the context-bar host — `top-0` of that host + right inset.
 * When Ticket push squeezes Unbox, mount on the pane with
 * {@link stationMoreDetailsPaneHostClass} instead.
 */
export const stationMoreDetailsHostClass =
  `pointer-events-auto absolute top-0 ${STATION_IDENTITY_INSET_RIGHT} flex items-start`;

/**
 * Pane-anchored more-details — same top/right insets. `z-panelPopover` sits
 * above fullscreen Unbox push (`z-panel`) so the carton ↑↓ cursor stays
 * visible and clickable on the top-right when the column is expanded.
 */
export const stationMoreDetailsPaneHostClass =
  `pointer-events-auto absolute ${STATION_IDENTITY_INSET_TOP} ${STATION_IDENTITY_INSET_RIGHT} z-panelPopover flex items-start`;

/**
 * One-row identity clearance (~28px flush at `top-0`, zero Y-pad).
 */
export const STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-7';

/**
 * Two-row identity clearance (~52px = chrome `h-7` + secondary `h-6`, gap-0 +
 * zero Y-pad). Opt in via `StationWorkbench reserveIdentityClearance="stacked"`.
 */
// ds-allow-spacing: stacked identity overlay = PRIMARY h-7 + secondary h-6 (not a density step).
export const STATION_IDENTITY_STACKED_SCROLL_CLEARANCE = 'pt-[52px]'; // ds-allow-spacing