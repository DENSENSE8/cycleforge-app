/**
 * Sidebar spine geometry — the ONE place the column width lives.
 *
 * It used to be a bare `w-[360px]` literal written out in several files (the
 * docked sidebar, its dynamic-import placeholder, the error fallback), each
 * carrying a comment asking the others to stay in step. The spine now mounts in
 * two different hosts — a resident column and a slide-over — so a drifting
 * literal would show up as the panel changing size when you pin it.
 *
 * **This is the NAV spine only.** The station bench panel
 * (`STATION_PANEL_COLUMN_CLASS`) is 360px too, and deliberately does not consume
 * this: they are two measurements that happen to agree today, not one shared
 * one. Wiring the bench to this token would mean widening the nav silently
 * widens the bench beside the workspace — a different surface, a different job.
 */
export const SIDEBAR_SPINE_WIDTH = 'w-[360px]';
