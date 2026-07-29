/**
 * Sidebar spine geometry — the ONE place the column width lives.
 *
 * It used to be a bare `w-[360px]` literal written out in several files (the
 * docked sidebar, its dynamic-import placeholder, the error fallback), each
 * carrying a comment asking the others to stay in step. The spine mounts in two
 * different hosts — the desktop push column and the mobile drawer — so a
 * drifting literal would show up as the panel changing size between them.
 *
 * **This is the NAV spine only.** The route's context panel
 * (`CONTEXT_PANEL_COLUMN_CLASS`) is 360px too, and deliberately does not consume
 * this: they are two measurements that happen to agree today, not one shared
 * one. Wiring the panel to this token would mean widening the nav silently
 * widens every route's rail beside the workspace — a different surface, a
 * different job.
 */
export const SIDEBAR_SPINE_WIDTH = 'w-[360px]';

/**
 * The same width as a number, for the one consumer that must animate it:
 * {@link SidebarNavColumn} tweens the column's own `width` from 0, and a
 * Tailwind class cannot be interpolated.
 *
 * Two spellings of one measurement is a fork risk, so they live on adjacent
 * lines: change one, change the other. (A `style={{ width }}` on the inner
 * column instead would move the geometry out of the token file and into the
 * component, which is the trade this pair exists to avoid.)
 */
export const SIDEBAR_SPINE_WIDTH_PX = 360;
