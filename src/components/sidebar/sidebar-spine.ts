import {
  DROPDOWN_ITEM_CORNER,
  DROPDOWN_SHELL_CORNER,
  SPINE_ROW_CORNER,
} from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

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
 *
 * **Desktop is drag-resizable now (2026-08-16); this class is the MOBILE
 * drawer's fixed width only.** `SidebarNavColumn`'s desktop push column reads
 * its live width from `useHorizontalEdgeResize` ({@link SIDEBAR_SPINE_RESIZE}
 * below), because a Tailwind class cannot be interpolated per-drag-frame. The
 * mobile drawer has no mouse to drag with, so it keeps this static class
 * unchanged — `SIDEBAR_SPINE_WIDTH_PX` is that drawer's fixed width AND the
 * desktop resize's persisted default.
 */
export const SIDEBAR_SPINE_WIDTH = 'w-[240px]';

/**
 * The same width as a number — the mobile drawer's fixed pixel twin of
 * {@link SIDEBAR_SPINE_WIDTH}, and the desktop resize's `defaultWidthPx`
 * (see {@link SIDEBAR_SPINE_RESIZE}).
 *
 * Two spellings of one measurement is a fork risk, so they live on adjacent
 * lines: change one, change the other.
 */
const SIDEBAR_SPINE_WIDTH_PX = 240;

/**
 * Drag-to-resize + drag-to-collapse contract for the MasterNav spine
 * (2026-08-16) — same grammar as {@link CONTEXT_PANEL_RESIZE}
 * (`context-panel-column.ts`): left-anchored, trailing-edge handle via
 * `useHorizontalEdgeResize`, width persists in localStorage, drag-past-min
 * collapses instead of flooring at `minWidthPx`. This retires the "MasterNav
 * spine stays click-only" line in `ContextPanelLayout.tsx` — the spine now
 * shares the exact industry splitter grammar (VS Code / Linear: drag the
 * seam to resize, drag past the floor to park, click the strip or the
 * GlobalHeader toggle to restore) instead of being the one nav surface that
 * doesn't.
 */
export const SIDEBAR_SPINE_RESIZE = {
  storageKey: 'sidebar-spine-width',
  defaultWidthPx: SIDEBAR_SPINE_WIDTH_PX,
  minWidthPx: 200,
  /** Generous enough for long destination labels; short of crowding the workspace. */
  maxWidthPx: 360,
} as const;

/** Inset of the collapsed hover-peek card from the viewport edge (px). */
export const SIDEBAR_SPINE_PEEK_INSET_PX = 8;

/**
 * Chrome for MasterNav **identity menus** (org/workspace switch + staff ⋯ menu).
 *
 * Sole consumer today: {@link StaffAccountFooter}. The ⋯ panel is the
 * shadcn/ui Popover (`radix-popover`), anchored to the footer row so width
 * tracks the spine. Soft shell ({@link DROPDOWN_SHELL_CORNER}) + caption type
 * — peer of dropdown menus, not a flush industrial plate. Never fork
 * `w-[260px]` / `w-[280px]` (or any wider literal) — guard:
 * `header-mode.guard.test.ts`.
 *
 * Gate: importers = StaffAccountFooter; API = class-string tokens only (no
 * schemas). User: account-details three-dots menu display (corners + motion).
 */
export const SIDEBAR_SPINE_MENU_PANEL_CLASS =
  `w-full overflow-hidden ${DROPDOWN_SHELL_CORNER} border border-border-soft bg-surface-card shadow-md`;

/** Dense header strip inside an identity menu (current workspace / staff card). */
export const SIDEBAR_SPINE_MENU_HEADER_CLASS =
  'flex min-w-0 items-center gap-2 border-b border-border-hairline px-3 py-2.5';

/** Dense action row inside an identity menu. */
export const SIDEBAR_SPINE_MENU_ACTION_CLASS =
  `flex w-full items-center gap-2.5 ${DROPDOWN_ITEM_CORNER} px-2.5 py-2 text-left transition hover:bg-surface-hover`;

/** Primary name inside an identity menu (org or staff). */
export const SIDEBAR_SPINE_MENU_TITLE_CLASS =
  'truncate text-role-caption font-semibold leading-tight text-text-default';

/**
 * Load-bearing org name in the staff ⋯ menu header — caption soft, never
 * eyebrow (eyebrow is for status labels; the chevron is enough for “current”).
 */
export const SIDEBAR_SPINE_MENU_ORG_CLASS =
  'truncate text-role-caption font-medium leading-tight text-text-soft';

/** Tertiary meta line (slug · plan · role). */
export const SIDEBAR_SPINE_MENU_META_CLASS = 'truncate text-role-micro text-text-soft';

/** Action label inside an identity menu. */
export const SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS =
  'text-role-caption font-medium text-text-default';

/**
 * The spine ROW face — geometry only; ink and fill come from `SPINE_ACCENT`
 * (`src/lib/nav/spine-section-accent.ts`).
 *
 * Promoted here from `SidebarNavList`'s module-locals on 2026-08-21 so the
 * MOBILE drawer renders the identical row instead of approximating it. It had
 * been approximating it badly: `rounded-2xl` rows with a `bg-blue-50` /
 * `ring-blue-200` active state — soft corners and a hue, both of which the
 * accent module bans outright ("No hue, anywhere in this module... No ring, no
 * shadow, no bevel. Ops chrome is flush-square and flat").
 *
 * Settled at `h-10` / 16px icon. Full reasoning, carried here with the tokens:
 *
 * Row height + glyph size for every destination row in this map (2026-08-16)
 * — deliberately its OWN local token, not `PRIMARY_CHROME_ROW_FACE` (28px ops
 * bands) and not `STATION_CHROME_ROW_FACE` (28px carton / Displays top). A
 * short destination list — Scan Stations' 7 benches, a domain section's 2-3
 * pages — used to huddle at 28px rows near the top of a column that runs
 * the full viewport height, leaving most of it visibly empty. Taller rows
 * spend that space instead of wasting it, and the glyph scales with the row
 * so it stays proportionate rather than shrinking inside a box that grew
 * around it. This trades the previous cross-column seam match (spine row 1
 * bottom ↔ the scan bar's) for legibility + fill — a deliberate call, not
 * an oversight; nothing else in the app reads this token, so nothing else
 * moved.
 *
 * **Settled at `h-10` / 16px icon (2026-08-16, second pass).** A first pass
 * went to `h-14` (56px) paired with `role-display` (24px) text — genuinely
 * too much: 56px rows and 24px labels are BUTTON scale, not repeated
 * nav-list-row scale, and no reference sidebar (VS Code ~13px/22px rows,
 * Linear/GitHub ~14px/32px, Slack/Notion ~14-15px/28-32px) runs anywhere
 * near that for an item that repeats a dozen times down a column. `h-10`
 * (40px) is generous against the 28px it replaced without reading as
 * oversized, and pairs with `role-title` (18px, see below) the way the
 * glyph below pairs with it — back to 16px, proportionate at this text size
 * rather than the 20px the 24px-text pass needed.
 * Destination labels — bumped 2026-08-20 from `role-nav` (13px) to
 * `role-body` (14px), matching {@link PAGE_FACE_CLASS}'s same-day bump in
 * `HeaderPageSwitcher.tsx` so the two navigators keep reading as one size
 * system, not two. Regular weight (not title 18px/600).
 */
/**
 * End pad inside a spine drill (Scan Stations benches, page children) so the
 * last row can scroll up past the sticky Back label and the account footer.
 */
export const SPINE_DRILL_SCROLL_END_CLASS = 'pb-32';

export const SPINE_ROW_FACE_CLASS = 'h-10 shrink-0';
export const SPINE_ROW_ICON_CLASS = 'h-4 w-4 shrink-0';
/** Destination labels — `role-body` (14px), regular weight. */
export const SPINE_LABEL_CLASS = 'text-role-body font-normal';

/**
 * The one row shell every spine destination shares: dense, full-width, and
 * softly cornered. Compose it with a `SPINE_ACCENT` state class; never restate
 * the geometry. Open-spine labelled Search uses this same shell so hover wash
 * follows {@link SPINE_ROW_CORNER} (main: `cornerClass('chip')` → 4px).
 *
 * `overflow-hidden` rides with the radius so a square fill cannot poke the
 * corners.
 */
export const SPINE_ROW_SHELL_CLASS = cn(
  'ds-raw-button group flex w-full items-center gap-2 overflow-hidden px-2 text-left transition-colors duration-150',
  SPINE_ROW_CORNER,
);

/**
 * Sticky section caption (Stations / Workspaces) — same plane as the spine
 * chrome so rows scrolling under it do not show through. Flush, not a card.
 */
export const SPINE_SECTION_LABEL_STICKY_CLASS = 'sticky top-0 z-10 bg-surface-card';

/** Scrollport thumb — same recipe as the ledger grid. */
export const SPINE_SCROLLPORT_SCROLLBAR_CLASS = 'cf-grid-scrollbar';
