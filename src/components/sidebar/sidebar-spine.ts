/**
 * Sidebar spine geometry — the ONE place the column width lives.
 *
 * It used to be a bare `w-[360px]` literal written out in four files (the docked
 * sidebar, its dynamic-import placeholder, the error fallback, and the station
 * panel), each carrying a comment asking the others to stay in step. The spine
 * now mounts in two different hosts — a resident column and a slide-over — so a
 * drifting literal would show up as the panel changing size when you pin it.
 */
export const SIDEBAR_SPINE_WIDTH = 'w-[360px]';
