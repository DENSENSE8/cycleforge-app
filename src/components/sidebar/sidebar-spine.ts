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

/**
 * Hover-peek overlay inset from the viewport left / header bottom.
 * The card hugs the destination list — it does not stretch to the account
 * footer. Shell corner is `cornerClass('surface')`.
 */
export const SIDEBAR_SPINE_PEEK_INSET_PX = 8;

/**
 * Chrome for MasterNav **identity menus** (org/workspace switch + staff ⋯ menu).
 *
 * The ⋯ panel is the shadcn/ui Popover (`radix-popover`), anchored to the
 * footer row so width tracks the spine. Flush industrial chrome
 * (`rounded-none` · `shadow-md`) + caption type — peer of `HeaderChromeMenu`,
 * never a chunkier twin of the band. Never fork `w-[260px]` / `w-[280px]` (or
 * any wider literal) — guard: `header-mode.guard.test.ts`.
 */
export const SIDEBAR_SPINE_MENU_PANEL_CLASS =
  'w-full overflow-hidden rounded-none border border-border-soft bg-surface-card shadow-md';

/** Dense header strip inside an identity menu (current workspace / staff card). */
export const SIDEBAR_SPINE_MENU_HEADER_CLASS =
  'flex min-w-0 items-center gap-2 border-b border-border-hairline px-2 py-1.5';

/** Dense action row inside an identity menu. */
export const SIDEBAR_SPINE_MENU_ACTION_CLASS =
  'flex w-full items-center gap-2 rounded-none px-2 py-1 text-left transition hover:bg-surface-hover';

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
 * Sizing history, kept because it is the argument, not the answer: the row
 * ran 28px, then briefly `h-14` (56px) with 24px text — BUTTON scale, not
 * repeated-nav-row scale — then settled at `h-10` on the reasoning that a
 * short list left a full-height column visibly empty. That held while the
 * spine listed a handful of destinations. It stopped holding once Pinned,
 * Stations, Desks and Studio all list at once: at that count the column is
 * over-full, not empty, and 40px rows are what makes it so. Hence
 * {@link SPINE_ROW_DENSITY} below — the reference bar the h-14 pass was
 * measured against (VS Code ~13px/22px, Linear/GitHub 13-14px/28-32px,
 * Slack/Notion 14-15px/28-32px) is the one the pointer face now sits on.
 *
 * The row now ships in the two densities this app actually has. One token, one
 * axis — before this the desktop spine rendered the shadcn variant's own
 * `h-8` / 14px, the drawer rendered `h-10` / 14px from here, and the tokens
 * that claimed to own the row were live on mobile and dead on desktop.
 *
 * `pointer` (28px / 13px) is the Linear · VS Code density for a list that
 * repeats a dozen-plus times down a full-height column: at that count a taller
 * row spends the column on chrome, and 13px is where every reference nav sits.
 *
 * `touch` (40px / 14px) is NOT the same measurement scaled — a thumb target
 * has a floor a pointer target does not, so the drawer keeps its height on
 * purpose. Both faces still take the same {@link SPINE_ROW_SHELL_CLASS},
 * {@link SPINE_ROW_ICON_CLASS} and `SPINE_ACCENT` state.
 */
export const SPINE_ROW_DENSITY = {
  pointer: {
    face: 'h-7 shrink-0',
    label: 'text-role-nav font-normal',
  },
  touch: {
    face: 'h-10 shrink-0',
    label: 'text-role-body font-normal',
  },
} as const;

export const SPINE_ROW_ICON_CLASS = 'h-4 w-4 shrink-0';

/**
 * Section labels stick to the top of the scrollport while their own group is in
 * view, then hand off to the next one. Each `SidebarGroup` is the sticky
 * container, so a label leaves exactly when its rows do — the operator always
 * knows which section the row under the pointer belongs to on a column that now
 * genuinely scrolls.
 */
export const SPINE_SECTION_LABEL_STICKY_CLASS = 'sticky top-0 z-10 bg-sidebar';

/**
 * The scrollport's own scrollbar — the house `.cf-grid-scrollbar` (globals.css),
 * NOT a spine-local fork.
 *
 * That class exists because a grid port that scrolls with nothing drawn reads
 * as a list that ends at the fold; its docblock argues the bar is not chrome
 * but the only thing on screen reporting how much is left below. A navigator
 * that scrolls has exactly that problem, so it takes exactly that answer.
 */
export const SPINE_SCROLLPORT_SCROLLBAR_CLASS = 'cf-grid-scrollbar';

/**
 * The one row shell every spine destination shares: flush, full-width, dense.
 * Compose it with a `SPINE_ACCENT` state class; never restate the geometry.
 * Pin rows use this same shell — same padding, same width as the catalog map.
 */
export const SPINE_ROW_SHELL_CLASS =
  'ds-raw-button group flex w-full items-center gap-2 rounded-none px-2 text-left transition-colors duration-150';

/**
 * MasterNav Pinned well. No disclosure, no hairline — pin rows are always
 * listed. Named `group/pinned` so cluster hover (pin-this-page) does not light
 * every row’s X.
 */
export const SPINE_PINNED_CLUSTER_CLASS = 'group/pinned relative';

/**
 * Category title row. Same `px-2` as {@link SPINE_ROW_SHELL_CLASS} so the
 * trailing pin and the per-row X share one right edge.
 */
export const SPINE_PINNED_TITLE_ROW_CLASS =
  'relative flex w-full items-center px-2 py-1.5';

/** Sentence-case category title — quieter than {@link SPINE_LABEL_CLASS}, never uppercase. */
export const SPINE_PINNED_TITLE_CLASS = 'text-role-micro font-normal text-text-soft';

/**
 * Pin-this-page and unpin X. One slot: `IconButton` xs, same inset as the
 * row’s `px-2` gutter.
 */
export const SPINE_PINNED_TRAIL_CLASS = 'absolute right-2 top-1/2 -translate-y-1/2';
export const SPINE_PINNED_TRAIL_GLYPH_CLASS = 'h-3.5 w-3.5';

const SPINE_PINNED_HOVER_BASE =
  'pointer-events-none opacity-0 transition-opacity duration-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100';

/**
 * Pin-this-page and empty hint — appear on well hover.
 */
export const SPINE_PINNED_CLUSTER_HOVER_CLASS =
  `${SPINE_PINNED_HOVER_BASE} group-hover/pinned:pointer-events-auto group-hover/pinned:opacity-100 group-focus-within/pinned:pointer-events-auto group-focus-within/pinned:opacity-100`;

/**
 * Per-row X. Same fade as {@link SPINE_PINNED_CLUSTER_HOVER_CLASS}, keyed to
 * the row’s own `group` on {@link SPINE_ROW_SHELL_CLASS}.
 */
export const SPINE_PINNED_ROW_ACTION_CLASS =
  `${SPINE_PINNED_HOVER_BASE} group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100`;
