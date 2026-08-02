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
 * (`CONTEXT_PANEL_WIDTH_PX` / `CONTEXT_PANEL_COLUMN_CLASS`) defaults to 360px
 * and deliberately does not consume this: they are two measurements for two
 * jobs. Receiving can drag-resize its rail via `CONTEXT_PANEL_RESIZE`; wiring
 * the panel to this spine token would still mean narrowing the nav silently
 * narrows every route's default rail.
 */
export const SIDEBAR_SPINE_WIDTH = 'w-[240px]';

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
export const SIDEBAR_SPINE_WIDTH_PX = 240;

/**
 * Chrome for MasterNav **identity menus** (org/workspace switch + staff ⋯ menu).
 *
 * Menus are a **child of the trigger**, not a second wider panel:
 * `AnchoredLayer` `*-stretch` against the trigger/row anchor (inset by the
 * band pad), so width ≤ {@link SIDEBAR_SPINE_WIDTH}. Dense chrome
 * (`rounded-lg` · `shadow-md`) + caption type — never a chunkier twin of the
 * band. Never fork `w-[260px]` / `w-[280px]` (or any wider literal) —
 * guard: `header-mode.guard.test.ts`.
 */
export const SIDEBAR_SPINE_MENU_PANEL_CLASS =
  'w-full overflow-hidden rounded-lg border border-border-soft bg-surface-card shadow-md';

/** Dense header strip inside an identity menu (current workspace / staff card). */
export const SIDEBAR_SPINE_MENU_HEADER_CLASS =
  'flex min-w-0 items-center gap-2 border-b border-border-hairline px-2 py-1.5';

/** Dense action row inside an identity menu. */
export const SIDEBAR_SPINE_MENU_ACTION_CLASS =
  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-surface-hover';
