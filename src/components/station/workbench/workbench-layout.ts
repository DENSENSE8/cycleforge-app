/**
 * Station workbench column widths — SoT for Unbox-family right-pane chrome.
 *
 * Receiving still re-exports these via `receiving-workspace-layout.ts` so
 * existing imports keep working; new stations import from this module.
 */

/** Centered content column for station workbench chrome + body. */
export const STATION_WORKBENCH_COLUMN = 'mx-auto w-full min-w-0 max-w-[720px]';

/** Header rows (stepper, toolbar) — align with PaneHeaderActionBar + stepper track. */
export const STATION_WORKBENCH_HEADER_COLUMN = `${STATION_WORKBENCH_COLUMN} px-6 sm:px-8`;

/** Scroll body cards — align with LineEditPanel hero column. */
export const STATION_WORKBENCH_BODY_COLUMN =
  `${STATION_WORKBENCH_COLUMN} space-y-4 px-4 py-5 pb-32 sm:px-6`;

/** Docked terminal band — lighter bottom padding (in-flow dock, not absolute float). */
export const STATION_WORKBENCH_BODY_DOCKED =
  `${STATION_WORKBENCH_COLUMN} space-y-4 px-4 py-5 pb-6 sm:px-6`;
