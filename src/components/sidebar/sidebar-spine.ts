import { SPINE_ROW_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Nav-map row geometry for the mobile/tablet `MobileSidebarDrawer`
 * (the desktop MasterNav spine was removed 2026-09-26). Ink and fill come
 * from `SPINE_ACCENT` (`src/lib/nav/spine-section-accent.ts`).
 */

/** Drawer / rail column width. */
export const SIDEBAR_SPINE_WIDTH = 'w-[240px]';

/** The spine ROW face — geometry only. */
export const SPINE_ROW_FACE_CLASS = 'h-10 shrink-0';
export const SPINE_ROW_ICON_CLASS = 'h-4 w-4 shrink-0';

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
