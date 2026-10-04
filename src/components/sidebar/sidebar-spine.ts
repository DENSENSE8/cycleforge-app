import {
  DROPDOWN_ITEM_CORNER,
  DROPDOWN_SHELL_CORNER,
  SPINE_ROW_CORNER,
} from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
export {
  SPINE_NAVIGATION_BAND_ORDER,
  spineNavigationBand,
  spineNavigationBandTitle,
  type SpineNavigationBand,
} from '@/lib/nav/spine-navigation-band';

/** Sidebar spine geometry — the ONE place the column width lives. */
export const SIDEBAR_SPINE_WIDTH = 'w-[240px]';

/** The same width as a number — the mobile drawer's fixed pixel twin of {@link SIDEBAR_SPINE_WIDTH}, and the desktop resize's… */
export const SIDEBAR_SPINE_WIDTH_PX = 240;

/** Drag-to-resize + drag-to-collapse contract for the MasterNav spine (2026-08-16) — same grammar as {@link CONTEXT_PANEL_RESIZE}… */
export const SIDEBAR_SPINE_RESIZE = {
  storageKey: 'sidebar-spine-width',
  defaultWidthPx: SIDEBAR_SPINE_WIDTH_PX,
  minWidthPx: 200,
  /** Generous enough for long destination labels; short of crowding the workspace. */
  maxWidthPx: 360,
} as const;

/** Inset of the collapsed hover-peek card from the viewport edge (px). */
export const SIDEBAR_SPINE_PEEK_INSET_PX = 8;

/** Chrome for MasterNav **identity menus** (org/workspace switch + staff account menu). */
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

/** The spine ROW face — geometry only; ink and fill come from `SPINE_ACCENT` (`src/lib/nav/spine-section-accent.ts`). */
export const SPINE_ROW_FACE_CLASS = 'h-10 shrink-0';
export const SPINE_ROW_ICON_CLASS = 'h-4 w-4 shrink-0';
/* `SPINE_CHILD_ROW_INDENT_CLASS` (`pl-8`) is DELETED, not deprecated (2026-09-14). */

/**
 * Group-body inset that puts the child RAIL directly under the parent row's
 * GLYPH — operator 2026-09-14: *"a hairline on the left side and aligned with
 */
export const SPINE_CHILD_RAIL_INSET_CLASS = 'pl-[15px]';

/**
 * The CONTINUOUS child rail — one unbroken hairline from the **bottom of the parent's glyph** down to the **bottom of the child list**.
 * Operator 2026-09-15: *"there's no hairline coming from the bottom of the
 */
export const SPINE_CHILD_RAIL_TRUNK_CLASS =
  'pointer-events-none absolute left-[15px] -top-3 bottom-0 w-0.5 bg-border-soft';

/** Destination labels — `role-body` (14px), regular weight. */
export const SPINE_LABEL_CLASS = 'text-role-body font-normal';

/** The one row shell every spine destination shares: */
export const SPINE_ROW_SHELL_CLASS = cn(
  'ds-raw-button group flex w-full items-center gap-2 overflow-hidden px-2 text-left transition-colors duration-150',
  SPINE_ROW_CORNER,
);

/** Parent rows feel physical without moving the surrounding list geometry. */
export const SPINE_PARENT_ROW_MOTION_CLASS =
  'will-change-transform transition-[background-color,box-shadow,transform] duration-200 ease-out hover:translate-x-0.5 active:translate-x-0 active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-colors';

/** Parent glyphs keep their small hover flourish; child rows remain quiet. */
export const SPINE_PARENT_ICON_MOTION_CLASS =
  'transition-[color,filter,transform] duration-200 ease-out group-hover:-rotate-3 group-hover:scale-110 group-active:scale-95 motion-reduce:transform-none';

/** The active parent's restrained category edge grows in instead of appearing as a hard rule. */
export const SPINE_PARENT_MARKER_CLASS =
  'pointer-events-none absolute inset-y-2.5 left-0 w-px origin-center rounded-full opacity-0 scale-y-50 transition-[opacity,transform] duration-200 ease-out';

/** Quiet hierarchy label used instead of horizontal rules between nav bands. */
export const SPINE_NAV_GROUP_TITLE_CLASS =
  'h-auto shrink-0 px-4 pb-0.5 pt-2 text-role-micro font-medium tracking-normal text-text-faint';

/**
 * Sticky section caption (Stations / Workspaces) — same plane as the spine
 * chrome so rows scrolling under it do not show through. Flush, not a card.
 */
export const SPINE_SECTION_LABEL_STICKY_CLASS = 'sticky top-0 z-10 bg-surface-card';

/** Scrollport thumb — same recipe as the ledger grid. */
export const SPINE_SCROLLPORT_SCROLLBAR_CLASS = 'cf-grid-scrollbar min-w-0';
