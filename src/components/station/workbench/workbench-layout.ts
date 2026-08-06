/**
 * Station workbench column widths — SoT for Unbox-family right-pane chrome.
 *
 * Receiving still re-exports these via `receiving-workspace-layout.ts` so
 * existing imports keep working; new stations import from this module.
 */

/**
 * Scan-station middle **lock** width (px) — twin of `min-w`/`max-w`/`w` on
 * {@link STATION_CENTER_COLUMN_CLASS} when Displays is open.
 * Hard floor and ceiling: the middle never shrinks below 720 under rail
 * pressure. Frame station push uses the same value as
 * `STATION_PUSH_CENTER_FLOOR_PX`.
 */
export const STATION_WORKBENCH_LOCK_PX = 720;

/**
 * In-flow sunken center column **while a station Displays push is open**.
 *
 * Locked at {@link STATION_WORKBENCH_LOCK_PX} (`min` = `max` = `w` = 720,
 * `shrink-0`) — sits flush before a **flex-1** Displays column that fills to
 * the pane's right edge. Open context + Displays widths are inverse-coupled
 * on sash drag (`station-dual-rail.ts`) while this middle stays 720. No
 * leading spacer. PhotoPeek pins to this column's `right-0`.
 *
 * When Displays is closed, hosts use {@link STATION_CENTER_COLUMN_OPEN_CLASS}
 * (full-pane `flex-1`); content still caps via {@link STATION_WORKBENCH_COLUMN}.
 */
export const STATION_CENTER_COLUMN_CLASS =
  'flex min-h-0 w-[720px] min-w-[720px] max-w-[720px] shrink-0 flex-col overflow-hidden';

/** Full-pane center when no Displays push is mounted — fills the host. */
export const STATION_CENTER_COLUMN_OPEN_CLASS =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden';

/**
 * Content column for station workbench chrome + body — the ONE middle wrapper.
 * Caps at {@link STATION_WORKBENCH_LOCK_PX} (`max-w-[720px]`) with `mx-auto` so
 * when Displays is closed the measure centres in the full pane. When Displays
 * is open the host is already 720, so this fills that column edge-to-edge.
 */
export const STATION_WORKBENCH_COLUMN =
  'w-full min-w-0 max-w-[720px] mx-auto';

/**
 * Horizontal inset inside the workbench column — **zero** so identity, PO lines,
 * and cards abut the measure edges. Readable air lives inside row/card
 * components.
 */
export const STATION_WORKBENCH_BODY_PAD_X = '';

/**
 * Full-bleed identity **host** ({@link StationContextBar} outer) — spans the
 * sunken center for layout only (no white). The white card face + chip measure
 * live on {@link STATION_WORKBENCH_COLUMN} (≤720). Do not paint `bg-surface-card`
 * here.
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
 */
export const STATION_UTILITY_RAIL_CLASS =
  'relative z-raised flex h-full w-8 shrink-0 flex-col items-center border-l border-border-soft bg-surface-card';
