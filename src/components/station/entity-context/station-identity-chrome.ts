/**
 * Station identity chrome — flush identity strip + corner utilities.
 *
 * Identity sits **flush under GlobalHeader** on the sunken work plane: square
 * top (no top radius / top hairline), bottom radius only, soft elevation. The
 * host is absolute (no in-flow gray shelf). Elevation uses DS
 * {@link elevationClass}(`raised`, `soft`). Icon gap matches GlobalHeader via
 * {@link HEADER_ICON_GAP}.
 *
 * ## Top inset SoT
 *
 * {@link STATION_IDENTITY_INSET_TOP} (`top-0`) pins identity + more-details
 * under the header. {@link STATION_IDENTITY_INSET_RIGHT} (`right-2`) keeps the
 * trailing utility cluster off the right edge. Never stack host `py-*` under
 * this float.
 *
 * Mid-canvas right-edge jumps ({@link stationRightEdgeActionClass}) are a
 * different job — flush-right sliced tab, not the top identity strip.
 */
import { HEADER_ICON_GAP } from '@/components/layout/header-shell';
import { elevationClass } from '@/design-system/tokens/shadows';

const STATION_IDENTITY_ELEVATION = elevationClass('raised', 'soft');

/** Absolute identity host — flush under GlobalHeader. */
export const STATION_IDENTITY_INSET_TOP = 'top-0';

/** Trailing inset for more-details / corner utilities. */
export const STATION_IDENTITY_INSET_RIGHT = 'right-2';

/**
 * Absolute float host for {@link StationContextBar} — click-through outer;
 * children re-enable with `pointer-events-auto`.
 */
export const stationContextBarHostClass =
  `pointer-events-none absolute inset-x-0 ${STATION_IDENTITY_INSET_TOP} z-raised`;

/**
 * Identity strip — square top flush under the header hairline; bottom corners
 * only; no top border (the header seam is the top edge).
 */
export const stationIdentityPanelClass =
  `rounded-t-none rounded-b-2xl border border-t-0 border-border-soft ${STATION_IDENTITY_ELEVATION}`;

/**
 * Top-right utilities shell — same flush-top recipe as the identity strip.
 */
export const stationUtilityPanelClass =
  `rounded-t-none rounded-b-2xl border border-t-0 border-border-soft ${STATION_IDENTITY_ELEVATION}`;

/**
 * Mid-canvas right-edge action tab — flush right; hairline on left · top ·
 * bottom; left corners rounded; right edge sliced.
 *
 * Host: {@link stationRightEdgeActionHostClass} on the panel’s `relative`
 * canvas root — not inside `StationContextBar` `moreDetails`.
 */
export const stationRightEdgeActionClass =
  `rounded-l-2xl rounded-r-none border border-r-0 border-border-soft ${STATION_IDENTITY_ELEVATION}`;

export const stationRightEdgeActionHostClass =
  'absolute right-0 top-1/4 z-raised';

/**
 * Inner pad for flush-top identity / utility faces — 4px top/sides, 6px
 * bottom so row 2 clears the strip edge (strip itself stays `top-0` /
 * square-top flush).
 */
export const stationIdentityPadClass = 'px-1 pt-1 pb-1.5';

/* ── Two-row identity rhythm ──────────────────────────────────────────────── */

/** Chip-to-chip step inside a row (`row-gap` = 2). */
export const STATION_IDENTITY_ROW_CLASS = 'row-gap';

/** Tighter step for the classify urgency·platform·type group (`row-tight`). */
export const STATION_IDENTITY_GROUP_CLASS = 'row-tight';

/** Vertical step between the two rows (`stack-row` = gap 2). */
export const STATION_IDENTITY_ROW_STACK_CLASS = 'stack-row';

/**
 * Leading 24px column shared by both rows — exit chevron (row 1) / lifecycle
 * dot (row 2) so both rows’ first chip share one x. Matches `IconButton` xs.
 */
export const STATION_IDENTITY_LEAD_COL_CLASS =
  'flex w-6 shrink-0 items-center justify-center';

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
 * One-row identity clearance (~40px flush at `top-0`). `pt-14` leaves a 16px
 * gap to the first body row.
 */
export const STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-14';

/**
 * Two-row identity clearance (~70px with `pb-1.5` + `stack-row`). `pt-20`
 * clears with a hairline to the in-flow Items header. Opt in via
 * `StationWorkbench reserveIdentityClearance="stacked"`.
 */
export const STATION_IDENTITY_STACKED_SCROLL_CLEARANCE = 'pt-20';
