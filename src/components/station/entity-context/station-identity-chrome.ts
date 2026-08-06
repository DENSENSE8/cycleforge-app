/**
 * Station identity chrome — coplanar flush band under GlobalHeader.
 *
 * Identity sits **flush under GlobalHeader** on the sunken work plane: square
 * all sides, hairline bottom seam only, no elevation. The **720 measure**
 * {@link STATION_WORKBENCH_COLUMN} (≤720 max; Displays locks on its trailing
 * edge) paints an opaque **white card face**

 * (`bg-surface-card`) so carton context aligns with PO lines below; sunken
 * gutters show left · right when Displays is closed — never a full-bleed white
 * curtain across the center pane. Icon gap matches GlobalHeader via
 * {@link HEADER_ICON_GAP}.
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
import { HEADER_ICON_GAP } from '@/components/layout/header-shell';
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
 * Chip-to-chip step inside a peer identity row — flush (zero gap). Classify
 * urgency·platform·type uses {@link STATION_IDENTITY_GROUP_CLASS} (`gap-1.5`)
 * instead — spaced pills, not abutting segmented seams. Never reintroduce
 * `row-gap` / `row-tight` air tokens for identity chrome.
 */
export const STATION_IDENTITY_ROW_CLASS = 'flex items-center gap-0';

/** Classify urgency·platform·type — spaced pills (`gap-1.5`), not abutting segmented seams. */
export const STATION_IDENTITY_GROUP_CLASS = 'flex items-center gap-1.5';

/** Vertical step between the two rows — flush (zero gap). */
export const STATION_IDENTITY_ROW_STACK_CLASS = 'flex flex-col gap-0';

/**
 * Leading 32px column shared by both rows — boxed exit chevron (row 1) /
 * lifecycle dot (row 2) so both rows’ first chip share one x. Matches
 * {@link STATION_CONTEXT_EXIT_PILL_CLASS} / `IconButton` md (`h-8 w-8`).
 */
export const STATION_IDENTITY_LEAD_COL_CLASS =
  'flex h-8 w-8 shrink-0 items-center justify-center';

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
 * One-row identity clearance (~40px flush at `top-0`, zero Y-pad).
 */
export const STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-10';

/**
 * Two-row identity clearance (~64px with gap-0 + zero Y-pad). Opt in via
 * `StationWorkbench reserveIdentityClearance="stacked"`.
 */
export const STATION_IDENTITY_STACKED_SCROLL_CLEARANCE = 'pt-16';
