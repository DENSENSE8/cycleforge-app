/**
 * Station workbench column widths — SoT for Unbox-family right-pane chrome.
 *
 * Receiving still re-exports these via `receiving-workspace-layout.ts` so
 * existing imports keep working; new stations import from this module.
 */

import { STATION_COLUMN_FOOTER_BAND_FACE } from '@/components/layout/header-shell';
import { CONTEXT_PANEL_RESIZE } from '@/components/sidebar/context-panel-column';
import { STATION_DISPLAYS_STRIP_CLASS } from '@/components/station/scan-depth';
import { cn } from '@/utils/_cn';

/** Scan-station middle **floor** width (px) — min-width on the elastic center column ({@link STATION_CENTER_COLUMN_OPEN_CLASS}) and the… */
export const STATION_WORKBENCH_LOCK_PX = 720;

/** The scan-station center column — **elastic** with a {@link STATION_WORKBENCH_LOCK_PX} (720) floor (`flex-1 min-w-[720px]`). */
export const STATION_CENTER_COLUMN_OPEN_CLASS =
  'flex min-h-0 min-w-[720px] flex-1 flex-col overflow-hidden';

/** Content column for station workbench chrome + body — the ONE middle wrapper. */
export const STATION_WORKBENCH_COLUMN = 'w-full min-w-0';

/** Horizontal inset inside the workbench column — **zero** so identity, PO lines, and bands abut the measure edges. */
export const STATION_WORKBENCH_BODY_PAD_X = '';

/** Full-bleed identity **host** ({@link StationContextBar} outer) — spans the sunken center for layout only (no white). */
export const STATION_WORKBENCH_IDENTITY_COLUMN = 'w-full min-w-0';

/** Station Displays push resize floor — lower than desk {@link DETAIL_STACK_RESIZE.minWidthPx} (360) so operators can shrink tools beside a… */
export const STATION_DISPLAYS_MIN_WIDTH_PX = 280;

/** Header rows (stepper, toolbar) — align with PaneHeaderActionBar + stepper track. */
export const STATION_WORKBENCH_HEADER_COLUMN = `${STATION_WORKBENCH_COLUMN} px-6 sm:px-8`;

/** Scroll body cards — align with LineEditPanel hero column. */
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

/** Scan-station utility rail — slim trailing chrome for Displays `←|` + carton `↑↓`. */
export const STATION_UTILITY_RAIL_CLASS = cn(
  STATION_DISPLAYS_STRIP_CLASS,
  'relative z-raised',
);

/**
 * Bottom cell of {@link STATION_UTILITY_RAIL_CLASS} — `←|` Open displays.
 * Same band as left-dock expand / `TechRailSearchBar` density=`row`.
 */
export const STATION_UTILITY_RAIL_FOOTER_CLASS = cn(
  'mt-auto justify-center',
  STATION_COLUMN_FOOTER_BAND_FACE,
);

// ── Column budget (min-fit walls — SoT for the three-column frame) ───────────

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

/** Frame width below which Displays auto-parks to the slim right-edge strip (never an overlay, never off-screen overflow). */
export const STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX =
  STATION_COLUMN_BUDGET.context.hardMinPx +
  STATION_COLUMN_BUDGET.primary.hardMinPx +
  STATION_COLUMN_BUDGET.displays.hardMinPx; // 1300

/** Hysteresis deadband (px) around the auto-close threshold so a manual drag or a scrollbar-injection blip near the boundary does not flap… */
export const STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX = 16;
