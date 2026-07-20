/**
 * Station workbench column widths — SoT for Unbox-family right-pane chrome.
 *
 * Receiving still re-exports these via `receiving-workspace-layout.ts` so
 * existing imports keep working; new stations import from this module.
 */

/** Centered content column for station workbench chrome + body. */
export const STATION_WORKBENCH_COLUMN = 'mx-auto w-full min-w-0 max-w-[720px]';

/**
 * Horizontal inset inside the workbench column — tabs, cards, and the sticky
 * identity bookmark all share this so their edges align.
 */
export const STATION_WORKBENCH_BODY_PAD_X = 'px-4 sm:px-6';

/**
 * Sticky identity bookmark column ({@link ReceivingStationContextBar}) —
 * same max-width + horizontal pad as the workbench body content.
 */
export const STATION_WORKBENCH_IDENTITY_COLUMN =
  `${STATION_WORKBENCH_COLUMN} ${STATION_WORKBENCH_BODY_PAD_X}`;

/** Header rows (stepper, toolbar) — align with PaneHeaderActionBar + stepper track. */
export const STATION_WORKBENCH_HEADER_COLUMN = `${STATION_WORKBENCH_COLUMN} px-6 sm:px-8`;

/** Scroll body cards — align with LineEditPanel hero column. */
export const STATION_WORKBENCH_BODY_COLUMN =
  `${STATION_WORKBENCH_COLUMN} space-y-4 ${STATION_WORKBENCH_BODY_PAD_X} py-5 pb-32`;

/** Docked terminal band — lighter bottom padding (in-flow dock, not absolute float). */
export const STATION_WORKBENCH_BODY_DOCKED =
  `${STATION_WORKBENCH_COLUMN} space-y-4 ${STATION_WORKBENCH_BODY_PAD_X} py-5 pb-6`;
