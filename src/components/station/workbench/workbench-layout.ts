/**
 * Station workbench column widths — SoT for Unbox-family right-pane chrome.
 *
 * Receiving still re-exports these via `receiving-workspace-layout.ts` so
 * existing imports keep working; new stations import from this module.
 */

import { CONTEXT_PANEL_RESIZE } from '@/components/sidebar/context-panel-column';

/**
 * Scan-station middle **floor** width (px) — min on
 * {@link STATION_CENTER_COLUMN_CLASS} / open center, and frame
 * `STATION_PUSH_CENTER_FLOOR_PX`. When Displays is open the center column is
 * still locked at this width so dual-rail math stays
 * `left + 720 + displays = frame`. Content measure
 * ({@link STATION_WORKBENCH_COLUMN}) is edge-to-edge of that column — no
 * `max-w` / `mx-auto` gutters.
 */
export const STATION_WORKBENCH_LOCK_PX = 720;

/**
 * In-flow sunken center column **while a station Displays push is open**.
 *
 * Locked at {@link STATION_WORKBENCH_LOCK_PX} (`min` = `max` = `w` = 720,
 * `shrink-0`) — sandwich **anchor** under rail pressure. Displays is the
 * trailing invader (`flex-1` — always fills leftover to the pane right edge;
 * never `ml-auto` detach / host `gap-*` / `justify-between`). Open context +
 * Displays are inverse-coupled on sash drag (`station-dual-rail.ts`) while
 * this middle stays 720. No leading spacer. PhotoPeek pins to this column's
 * `right-0`.
 *
 * When Displays is closed, hosts use {@link STATION_CENTER_COLUMN_OPEN_CLASS}
 * (full-pane `flex-1` with the same min floor). Content is edge-to-edge via
 * {@link STATION_WORKBENCH_COLUMN} — identity + notes dock share one measure.
 */
export const STATION_CENTER_COLUMN_CLASS =
  'flex min-h-0 w-[720px] min-w-[720px] max-w-[720px] shrink-0 flex-col overflow-hidden';

/** Full-pane center when no Displays push is mounted — fills the host edge-to-edge. */
export const STATION_CENTER_COLUMN_OPEN_CLASS =
  'flex min-h-0 min-w-[720px] flex-1 flex-col overflow-hidden';

/**
 * Content column for station workbench chrome + body — the ONE middle wrapper.
 * Edge-to-edge of the center column (`w-full`, no `max-w` / `mx-auto` gutters)
 * so identity, PO lines, and the floating notes dock share the same width.
 * Floor lives on the center column host ({@link STATION_WORKBENCH_LOCK_PX}).
 */
export const STATION_WORKBENCH_COLUMN = 'w-full min-w-0';

/**
 * Horizontal inset inside the workbench column — **zero** so identity, PO lines,
 * and cards abut the measure edges. Readable air lives inside row/card
 * components.
 */
export const STATION_WORKBENCH_BODY_PAD_X = '';

/**
 * Full-bleed identity **host** ({@link StationContextBar} outer) — spans the
 * sunken center for layout only (no white). The white card face + chip measure
 * live on {@link STATION_WORKBENCH_COLUMN} (edge-to-edge of center). Do not
 * paint `bg-surface-card` here.
 */
export const STATION_WORKBENCH_IDENTITY_COLUMN = 'w-full min-w-0';

/**
 * Station Displays push resize floor — lower than desk
 * {@link DETAIL_STACK_RESIZE.minWidthPx} (360) so operators can shrink tools
 * beside a locked 720 middle without crushing Claim / topic chrome.
 * Desk inspectors keep 360.
 */
export const STATION_DISPLAYS_MIN_WIDTH_PX = 280;

/** Header rows (stepper, toolbar) — align with PaneHeaderActionBar + stepper track. */
export const STATION_WORKBENCH_HEADER_COLUMN = `${STATION_WORKBENCH_COLUMN} px-6 sm:px-8`;

/**
 * Scroll body cards — align with LineEditPanel hero column.
 * Top clearance assumes a floating {@link StationContextBar}
 * (`STATION_IDENTITY_SCROLL_CLEARANCE`); bottom assumes absolute terminal dock.
 * Prefer composing via StationWorkbench (reads the live clearance token) —
 * these literals stay in sync with {@link STATION_IDENTITY_SCROLL_CLEARANCE}.
 */
export const STATION_WORKBENCH_BODY_COLUMN =
  `${STATION_WORKBENCH_COLUMN} space-y-4 pt-14 pb-32`;

/**
 * Docked terminal band — lighter bottom padding (in-flow dock, not absolute float).
 * Top clearance still assumes floating identity.
 */
export const STATION_WORKBENCH_BODY_DOCKED =
  `${STATION_WORKBENCH_COLUMN} space-y-4 pt-14 pb-6`;

/** Shared flex host for scan-station center + Displays (Unbox · Arrival · Testing). */
export const STATION_SCAN_PANE_HOST_CLASS =
  'relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden';

/**
 * Scan-station utility rail — slim white trailing chrome for Displays `←|` +
 * carton `↑↓`. Sibling of the center column (and of Displays when open) — never
 * inside {@link CartonContextCard}. Mirror of the left context collapse strip
 * (`CONTEXT_PANEL_COLLAPSE_STRIP_CLASS`), trailing hairline against center /
 * Displays.
 *
 * **Open displays (`←|`) seats at the bottom** — same footer cell as the left
 * dock expand (`CONTEXT_PANEL_COLLAPSE_STRIP_FOOTER_CLASS`). Carton `↑↓` stay
 * at the top of the strip.
 */
export const STATION_UTILITY_RAIL_CLASS =
  'relative z-raised flex h-full w-8 shrink-0 flex-col items-center border-l border-border-soft bg-surface-card';

/**
 * Bottom cell of {@link STATION_UTILITY_RAIL_CLASS} — `←|` Open displays.
 * Same band as left-dock expand / `TechRailSearchBar` density=`row` (`h-8` +
 * `border-t`).
 */
export const STATION_UTILITY_RAIL_FOOTER_CLASS =
  'mt-auto flex h-8 w-full shrink-0 items-center justify-center border-t border-border-hairline';

// ── Column budget (the yield ladder — SoT for the three-column frame) ────────
//
// The three-column Station frame (Context · locked Primary · Displays) is a
// width BUDGET, not three independent preferred widths. Every pane declares a
// tuple; the pure resolver (`station-dual-rail.ts` → resolveStationYieldLadder)
// distributes width by `shrinkPriority` while never violating a `hardMinPx`
// wall. Precedent: SAP Fiori Flexible Column Layout (columns collapse by a
// priority order rather than crushing uniformly) and Material 3 supporting-pane
// collapse (the supporting pane yields — collapses to an overlay — before the
// primary pane is squeezed).
//
//   shrinkPriority: 0 = Locked (never yields) · 1 = yields first · 2 = yields second
//   preferredPx:    a TARGET the resolver aims for · 'fill' = claims leftover (flex-1)
//   softMaxPx:      advisory ceiling (NOT a wall — a wide Displays on a 1080p
//                   monitor legitimately exceeds it; `null` = no ceiling)
//   hardMinPx:      an unyielding geometric wall — a pane at its hardMin either
//                   holds or (if shrinkable) transitions to CLOSED (I6)

/** 0 = Locked · 1 = yields first · 2 = yields second. */
type StationShrinkPriority = 0 | 1 | 2;

interface StationColumnBudgetEntry {
  /** Unyielding geometric wall (px). */
  hardMinPx: number;
  /** Target width (px), or `'fill'` for the leftover-claiming (flex-1) pane. */
  preferredPx: number | 'fill';
  /** Advisory ceiling (px) — not enforced as a wall. `null` = unbounded. */
  softMaxPx: number | null;
  /** Yield order under width pressure. */
  shrinkPriority: StationShrinkPriority;
}

/**
 * Scan-station three-column budget (Unbox · Arrival · Testing · Pack ·
 * Shipping · Review). Numbers are SOURCED from the live width constants — the
 * budget is a declarative view of them, never a second copy.
 *
 * - **primary** is Locked (`shrinkPriority: 0`) at the 720 workbench lock —
 *   `flex: 0 0 720px`, so the browser can never crush it below its floor.
 * - **displays** yields FIRST (it is the leftover-filler; it shrinks as the
 *   frame narrows, then CLOSES at the auto-close threshold rather than
 *   crushing the middle or the rail).
 * - **context** yields SECOND (from its preferred toward its 300 hardMin).
 */
export const STATION_COLUMN_BUDGET = {
  context: {
    hardMinPx: CONTEXT_PANEL_RESIZE.minWidthPx, // 300
    preferredPx: CONTEXT_PANEL_RESIZE.defaultWidthPx, // 360
    softMaxPx: 420,
    shrinkPriority: 2,
  },
  primary: {
    hardMinPx: STATION_WORKBENCH_LOCK_PX, // 720
    preferredPx: STATION_WORKBENCH_LOCK_PX, // 720 — Locked
    softMaxPx: null,
    shrinkPriority: 0,
  },
  displays: {
    hardMinPx: STATION_DISPLAYS_MIN_WIDTH_PX, // 280
    preferredPx: 'fill', // flex-1 leftover
    softMaxPx: 720,
    shrinkPriority: 1,
  },
} as const satisfies Record<'context' | 'primary' | 'displays', StationColumnBudgetEntry>;

/**
 * Frame width below which Displays auto-closes (yields first — SAP Fiori /
 * Material 3 collapse hierarchy). Derived, never hand-picked: it is the exact
 * sum at which Displays can no longer hold its `hardMinPx` beside an OPEN
 * context rail already yielded to ITS `hardMinPx` and the locked middle —
 * `300 + 720 + 280`. When the operator parks the context rail the effective
 * threshold drops by the rail cost (the strip is cheaper than the 300 min), so
 * the reactive computation in `frame.ts` reads the live minimum left cost; this
 * constant is the rail-OPEN case.
 */
export const STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX =
  STATION_COLUMN_BUDGET.context.hardMinPx +
  STATION_COLUMN_BUDGET.primary.hardMinPx +
  STATION_COLUMN_BUDGET.displays.hardMinPx; // 1300

/**
 * Hysteresis deadband (px) around the auto-close threshold so a manual drag or
 * a scrollbar-injection blip near the boundary does not flap Displays
 * open/closed. Displays CLOSES the instant it can no longer hold its hardMin
 * (I6 — the close edge is hard at the threshold) and only REOPENS once the
 * frame clears the threshold by `2 ×` this value (the deadband sits above the
 * close threshold, so an OPEN Displays is always one that genuinely fits).
 */
export const STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX = 16;
