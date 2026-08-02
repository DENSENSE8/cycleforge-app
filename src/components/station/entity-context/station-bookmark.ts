/**
 * Station bookmark chrome — floating identity + corner utilities.
 *
 * Identity + more-details are raised shells (full radius, full hairline, soft
 * elevation) that **overlay** the work canvas — same placement idea as a
 * floating `SlicedActionDock` (`docked: false`), but pinned to the top.
 * The host is absolute (no in-flow canvas band / gray shelf behind the shell).
 * Elevation uses DS {@link elevationClass}(`raised`, `soft`) — softer than
 * glass work cards (`raised` default). Inner pad + icon gap match GlobalHeader
 * via {@link HEADER_ICON_GAP} (header-shell SoT).
 *
 * ## Station top-padding SoT
 *
 * {@link STATION_BOOKMARK_CANVAS_INSET_TOP} (`top-2`) is the **station** twin of
 * `CONTEXT_PANEL_OUTER_MARGIN` (`m-2`) — one 8px canvas gutter under
 * GlobalHeader so identity + more-details + the left rail card share one top
 * edge. Right twin: {@link STATION_BOOKMARK_CANVAS_INSET_RIGHT}.
 *
 * **Never stack a second vertical inset under this host.** An ancestor with
 * `py-2` (the old Unbox push host pad) pushes the identity's containing block
 * down, then `top-2` adds another 8px → 16px vs the rail's 8px. Trailing push
 * gutter stays host `pr-2`; vertical push gutter is
 * `CONTEXT_PANEL_OUTER_MARGIN_Y` (`my-2`) on the push column itself.
 *
 * Mid-canvas right-edge jumps stay a sliced side bookmark (flush right) —
 * different job from the floating identity / more-details shells.
 */
import { HEADER_ICON_GAP } from '@/components/layout/header-shell';
import { elevationClass } from '@/design-system/tokens/shadows';

/** Soft raised — lighter than glass work-card `raised` default. */
const STATION_BOOKMARK_ELEVATION = elevationClass('raised', 'soft');

/**
 * Station canvas **top** gutter — SoT twin of context-panel `m-2`
 * (`CONTEXT_PANEL_OUTER_MARGIN`). Absolute hosts compose this; never replace
 * with a page-local `top-*` or stack host `py-*` above it.
 */
export const STATION_BOOKMARK_CANVAS_INSET_TOP = 'top-2';

/**
 * Station canvas **right** gutter — SoT twin of context-panel `m-2` on the
 * trailing edge. More-details inside {@link StationContextBar} stays `top-0`
 * of that host and only adds this inset (no double top).
 */
export const STATION_BOOKMARK_CANVAS_INSET_RIGHT = 'right-2';

/**
 * Absolute float host for {@link StationContextBar} — overlays the panel top
 * with no reserved in-flow shelf (the gray “context bar band”). Click-through
 * outer; children re-enable with `pointer-events-auto`. Mirrors
 * `slicedActionDockWrapperClass({ docked: false })` for the bottom dock.
 * Top inset is {@link STATION_BOOKMARK_CANVAS_INSET_TOP} (context-panel twin).
 */
export const stationContextBarHostClass =
  `pointer-events-none absolute inset-x-0 ${STATION_BOOKMARK_CANVAS_INSET_TOP} z-raised`;

/**
 * Centered identity shell — full `rounded-2xl` + full hairline so it floats
 * over the work canvas.
 */
export const stationBookmarkPanelClass =
  `rounded-2xl border border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/**
 * Top-right utilities shell — same floating recipe as the identity bookmark.
 * Host places it at the canvas top + right via {@link StationContextBar}.
 */
export const stationMoreDetailsPanelClass =
  `rounded-2xl border border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/**
 * Mid-canvas right-edge action tab (e.g. Triage → Open in Unbox) — flush
 * right; hairline on left · top · bottom; left corners rounded; right edge
 * sliced (no right radius / border) so it reads as a canvas bookmark.
 *
 * Host: mount on the station panel’s `relative` canvas root with
 * {@link stationRightEdgeActionHostClass} — **not** inside
 * `StationContextBar` `moreDetails` (that slot is top-right utilities only).
 */
export const stationRightEdgeActionClass =
  `rounded-l-2xl rounded-r-none border border-r-0 border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/**
 * Required placement for {@link StationRightEdgeAction}: flush right, ~¼ down
 * the work canvas (thumb zone). Apply on the action panel itself; parent must
 * be `position: relative` and full-height. Stays below SlicedActionDock / dock
 * (`z-fab`) and overlays; above workbench body (`z-0`).
 */
export const stationRightEdgeActionHostClass =
  'absolute right-0 top-1/4 z-raised';

/** Inner pad for identity + more-details bookmark faces (matches icon-gap unit). */
export const stationBookmarkPadClass = 'p-0.5';

/* ── Stacked identity rhythm (the two-row `bar-stacked` band) ─────────────────
 *
 * Every gap in that band resolves here, so the two rows share ONE cadence
 * instead of each row hand-picking a value. All three compose Tier-2 spacing
 * intents (tailwind.config.ts plugin, `ui-design-system.md` → Spacing) — they
 * are density-aware and already carry `display:flex` + `align-items:center`,
 * so never pair them with a raw `flex`/`gap-*` (both survive `cn()` and the
 * intent wins in CSS order).
 */

/**
 * Chip-to-chip step INSIDE a row, and the row's own track (`row-gap` = 2).
 * One value for both rows is what makes the band read as a grid.
 */
export const STATION_IDENTITY_ROW_CLASS = 'row-gap';

/**
 * Tighter step for a pill GROUP that reads as one control — the classify
 * urgency·platform·type triple (`row-tight` = 1.5). Deliberately below
 * {@link STATION_IDENTITY_ROW_CLASS}: the group must bind visually before it
 * separates from its neighbours.
 */
export const STATION_IDENTITY_GROUP_CLASS = 'row-tight';

/** Vertical step between the two rows (`stack-tight` = 1.5). */
export const STATION_IDENTITY_ROW_STACK_CLASS = 'stack-tight';

/**
 * Leading gutter shared by both rows — one 32px icon box (`w-8`, the
 * `IconButton size="md"` box the exit chevron already occupies). Row 1 puts the
 * chevron in it and row 2 the lifecycle dot, so the dot centres under the
 * chevron and BOTH rows' first chip starts at the same x. Without it the rows
 * began 32px apart and never formed columns.
 */
export const STATION_IDENTITY_LEAD_COL_CLASS =
  'flex w-8 shrink-0 items-center justify-center';

/** Gap between icons / chips inside a bookmark — same integer as GlobalHeader. */
export const stationBookmarkGapClass = HEADER_ICON_GAP;

/**
 * Corner placement for more-details inside the floating context-bar host —
 * `top-0` of that host (which already carries the canvas top gutter) +
 * `right-2` so the shell matches the context-panel card’s right margin.
 * Pair with `pointer-events-auto`.
 *
 * When Ticket push squeezes Unbox, mount More details on the **pane** outer
 * host with {@link stationMoreDetailsPaneHostClass} instead so the icons do
 * not slide left with the squeezed Unbox column.
 */
export const stationMoreDetailsHostClass =
  `pointer-events-auto absolute top-0 ${STATION_BOOKMARK_CANVAS_INSET_RIGHT} flex items-start`;

/**
 * Pane-anchored more-details — canvas top + right gutters + `z-raised` on the
 * receiving outer host (sibling of Unbox column + push). Use when corner
 * utilities must stay put while a right-edge push column opens.
 */
export const stationMoreDetailsPaneHostClass =
  `pointer-events-auto absolute ${STATION_BOOKMARK_CANVAS_INSET_TOP} ${STATION_BOOKMARK_CANVAS_INSET_RIGHT} z-raised flex items-start`;

/**
 * Scroll-body top clearance when {@link StationContextBar} floats absolute
 * over the canvas (canvas inset + identity shell ≈ `min-h-10` + pad + shadow).
 * Pair with `StationWorkbench` `reserveIdentityClearance`.
 *
 * Measured (2026-07-31, Playwright @ 1280/1440/1920): one-row identity is 40px
 * tall at `top-2`, so `pt-16` leaves a 16px gap to the first body row.
 */
export const STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-16';

/**
 * Same clearance for a TWO-row identity (`CartonContextCard`
 * `density="bar-stacked"` — Unbox). Row 1 carries the 32px controls (exit ·
 * classify pills · listing · Claim · Photos) and row 2 the 24px fact track
 * (lifecycle dot · order# · tracking# · qty · PO total), separated by 6px, so
 * the shell measures 68px against the one-row 40px.
 *
 * `pt-24` clears it with a 20px gap (the one-row pair is 16px). Measured in
 * Playwright at 1280/1440/1920 — re-measure when a row gains or loses a
 * control: `pt-20` was correct at 62px and leaves only 4px at 68px.
 *
 * A THIRD row would blow this budget entirely — re-derive, never assume the
 * next scale step absorbs it.
 *
 * Opt in per host via `StationWorkbench reserveIdentityClearance="stacked"` —
 * never by raising {@link STATION_IDENTITY_SCROLL_CLEARANCE}, which would add
 * dead space to every one-row station.
 */
export const STATION_IDENTITY_STACKED_SCROLL_CLEARANCE = 'pt-24';
