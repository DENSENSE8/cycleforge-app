/**
 * Station workbench column widths — SoT for Unbox-family right-pane chrome.
 *
 * Receiving still re-exports these via `receiving-workspace-layout.ts` so
 * existing imports keep working; new stations import from this module.
 */

import { STATION_COLUMN_FOOTER_BAND_FACE } from '@/components/layout/header-shell';
import { CONTEXT_PANEL_RESIZE } from '@/lib/sidebar/context-panel-column';
import { cn } from '@/utils/_cn';

/**
 * Scan-station middle **floor** width (px) — min-width on the elastic center
 * column ({@link STATION_CENTER_COLUMN_OPEN_CLASS}) and the frame budget's
 * `STATION_PUSH_CENTER_FLOOR_PX`.
 *
 * The center is the row's single **elastic absorber** (the VS Code editor
 * model): it grows above this floor when the side rails are narrow and shrinks
 * to exactly this floor when they are wide. A sash **stops** here rather than
 * pushing the center below it — it never crushes the middle and never reaches
 * across to move the far rail. (Formerly a hard 720 lock while Displays flexed;
 * relaxed to a floor 2026-08-10 when the rails were decoupled.) Content measure
 * ({@link STATION_WORKBENCH_COLUMN}) is edge-to-edge of the center — no `max-w`
 * / `mx-auto` gutters.
 */
export const STATION_WORKBENCH_LOCK_PX = 720;

/**
 * The scan-station center column — **elastic** with a
 * {@link STATION_WORKBENCH_LOCK_PX} (720) floor (`flex-1 min-w-[720px]`).
 *
 * The center is the row's single elastic absorber. Dragging the left context
 * sash or the right Displays sash resizes THAT rail; the center absorbs the
 * change and the OTHER rail is untouched (every reference splitter — VS Code,
 * Figma, Slack — resizes only the pane adjacent to the sash and flexes the
 * center). The center grows above 720 when both rails are narrow and shrinks to
 * its 720 floor when they are wide; a sash clamps at the floor rather than
 * crushing the middle. Content ({@link STATION_WORKBENCH_COLUMN}) is
 * edge-to-edge of this column; PhotoPeek pins to its `right-0`.
 *
 * (Option A, 2026-08-10 — collapsed a locked-720 variant and an open variant
 * into this one elastic class. Displays is now an explicitly-sized, locally
 * resizable sibling instead of a `flex-1` invader.)
 */
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
 * **Open displays (`←|`) seats at the bottom** of this rail — it opens a column
 * that is not mounted, so it is a real control rather than a second door onto
 * a click the strip already accepts. (The left dock's own foot expand, which
 * this used to reference for its seat, was deleted 2026-08-19 precisely
 * because it WAS that second door.) Carton `↑↓` stay at the top of the strip.
 * Closed body ({@link StationDisplaysUtilityRail}) also opens on whole-strip
 * click.
 */
export const STATION_UTILITY_RAIL_CLASS =
  'relative z-raised flex h-full w-8 shrink-0 flex-col items-center border-l border-border-soft bg-surface-card';

/**
 * Bottom cell of {@link STATION_UTILITY_RAIL_CLASS} — `←|` Open displays.
 * Same band as left-dock expand / `TechRailSearchBar` density=`row`.
 */
export const STATION_UTILITY_RAIL_FOOTER_CLASS = cn(
  'mt-auto justify-center',
  STATION_COLUMN_FOOTER_BAND_FACE,
);

// ── Column budget (min-fit walls — SoT for the three-column frame) ───────────
//
// The three-column Station frame (Context · elastic Primary · Displays) declares
// each pane's `hardMinPx` — the min width that pane needs to stay open. Only the
// mins are consumed: they derive the Displays auto-close threshold
// {@link STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX}. Numbers are SOURCED from the live
// width constants, never a second copy.
//
// Under **Option A** (2026-08-10) the center is the elastic absorber (floor
// {@link STATION_WORKBENCH_LOCK_PX}), and the context rail + Displays are
// explicitly sized, locally resizable panels — each sash clamps so the center
// never drops below its floor and never moves the far rail. The old
// `shrinkPriority` "yield ladder" + inverse dual-rail coupling were retired: a
// right-panel sash that moved the far LEFT rail was unintuitive (every reference
// splitter resizes only the pane adjacent to the sash and flexes the center).
// Below the min-fit threshold Displays auto-parks to the slim strip (never
// overlay-hides the dock, never overflows the pane).

/**
 * Scan-station three-column min-fit walls (Unbox · Arrival · Testing · Pack ·
 * Shipping · Review). Only `hardMinPx` is consumed — it feeds
 * {@link STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX}. Sourced from the live constants.
 */
export const STATION_COLUMN_BUDGET = {
  context: { hardMinPx: CONTEXT_PANEL_RESIZE.minWidthPx }, // 300
  primary: { hardMinPx: STATION_WORKBENCH_LOCK_PX }, // 720 — center floor
  displays: { hardMinPx: STATION_DISPLAYS_MIN_WIDTH_PX }, // 280
} as const satisfies Record<'context' | 'primary' | 'displays', { hardMinPx: number }>;

/**
 * Frame width below which Displays auto-parks to the slim right-edge strip
 * (never an overlay, never off-screen overflow). Derived: the exact sum at
 * which Displays can no longer hold its `hardMinPx` beside the context rail and
 * the center floor — `300 + 720 + 280`. The reactive computation in `frame.ts`
 * reads the rail's live ACTUAL cost, so a WIDER-than-min left rail parks
 * Displays earlier and a parked rail lets it survive narrower; this constant is
 * the rail-at-min case.
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
