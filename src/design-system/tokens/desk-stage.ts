/** Non-scan **desk stage** measure — SoT for {@link DeskPageChrome}'s content frame. */

import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';

/** Desk stage ceiling (px). */
const DESK_STAGE_MAX_PX = 1152;

/**
 * Default stage: centered, capped at {@link DESK_STAGE_MAX_PX}. The grid inside
 * may still scroll horizontally when its columns exceed the stage; the PAGE
 * does not become a full-bleed spreadsheet. The list is one rounded floating
 * card on the grey canvas (owner 2026-09-26, a Shopify order list).
 */
export const DESK_STAGE_FIXED_CLASS = 'mx-auto w-full max-w-6xl';

/** Fixed measure for the ONE record column a desk walk opens over the stage — the To-ship Labels walk's order form (parcel · ShipStation… */
const DESK_RECORD_MEASURE_PX = 736;

/** Tailwind twin of {@link DESK_RECORD_MEASURE_PX} (46rem). */
export const DESK_RECORD_MEASURE_CLASS = 'w-[46rem]';

/**
 * {@link DeskRecordPlane}'s **split** view (operator 2026-09-25; owner
 * 2026-09-26): the LIST area takes two thirds on the left for triage, the
 * record pane the right third, its columns stacked into one. Full width with
 * side gutters; the list scrolls to the bottom edge (no card).
 */
export const DESK_SPLIT_LIST_CLASS = 'flex min-h-0 min-w-0 basis-2/3 flex-col px-6';

/** The record pane beside {@link DESK_SPLIT_LIST_CLASS} — the right third. */
export const DESK_SPLIT_RECORD_CLASS = 'flex min-w-0 basis-1/3 flex-col';

/**
 * The pane surface inside {@link DESK_SPLIT_RECORD_CLASS} — PLANTED on the one
 * white page (owner 2026-09-26): only the record's columns lift, never the
 * pane or its header. One hairline seam separates it from the list.
 */
export const DESK_SPLIT_RECORD_CARD_CLASS = 'flex min-h-0 flex-1 flex-col overflow-hidden border-l border-mode-divide bg-surface-card';

/**
 * A record COLUMN — the 2/3 work column and the 1/3 facts column of
 * {@link DESK_RECORD_COLUMNS_CLASS} — the only lifted surfaces on a desk
 * record (owner 2026-09-26, Shopify / Ecwid order page): the mode's card
 * corner and the raised shadow on the white page. Industrial keeps the ink box
 * (`frame`), square.
 */
export const DESK_RECORD_COLUMN_CARD_CLASS = `flex min-w-0 flex-col overflow-hidden rounded-mode border border-mode-frame bg-mode-bar ${elevationClass('raised')}`;

/**
 * The split LIST's body (owner 2026-09-26): full width of its two thirds with
 * the gutter padding, a plain scrollable list — no card, no rounded or
 * floating bottom edge, no in-page wrapper.
 */
export const DESK_SPLIT_LIST_CARD_CLASS = 'flex min-h-0 min-w-0 w-full flex-1 flex-col';

/**
 * One record, two widths (operator 2026-09-25). In place the record gets the
 */
export const DESK_RECORD_COLUMNS_CLASS = 'grid grid-cols-1 items-start gap-4 @4xl:grid-cols-3';

/** The main (work) column of {@link DESK_RECORD_COLUMNS_CLASS}. */
export const DESK_RECORD_MAIN_COLUMN_CLASS = 'min-w-0 @4xl:col-span-2';

/** The identity-facts column of {@link DESK_RECORD_COLUMNS_CLASS}. */
export const DESK_RECORD_ASIDE_COLUMN_CLASS = 'min-w-0';

/** Fullscreen stage: the gutters collapse and the body takes the content canvas. */
export const DESK_STAGE_FULLSCREEN_CLASS = 'w-full';

/**
 * Gutter the fixed stage sits in. Only paints when the stage is capped —
 * fullscreen means flush, or it would not be full.
 */
export const DESK_STAGE_GUTTER_CLASS = 'px-4';

/** The **floor** under the card (operator ruling 2026-08-31). */
export const DESK_STAGE_FLOOR_CLASS = 'pb-4';

/**
 * Desk **corner + inset** grammar — the deliberate split from the scan-station
 * chrome (operator ruling 2026-08-30).
 */

/** The **page header row** — title left, primary CTA right. */
export const DESK_PAGE_HEADER_ROW_CLASS = 'py-3';

/** The **tab row**, on its own line under the header. */
export const DESK_TAB_ROW_CLASS = 'h-9 border-b border-border-hairline';

/**
 * Shared tab-list geometry for every desk page. The list remains a normal
 * left-to-right row; fixed-width triggers own their label alignment.
 */
const DESK_TAB_LIST_CLASS =
  'flex min-w-0 flex-1 items-stretch gap-1';

/** Shared fixed-width desk-tab face with a centered label. */
const DESK_TAB_TRIGGER_CLASS =
  'ds-raw-button inline-flex shrink-0 items-center justify-center gap-1 px-3 text-center text-role-caption';

/**
 * Space between the tab row and the table card.
 * Empty (operator 2026-09-04): the card welds to the tab row so the filter
 */
export const DESK_STAGE_DETACH_CLASS = '';

/**
 * The desk **card shell** — rounded container under the tab row.
 * NO outer border or hairline (operator ruling 2026-08-31). Soft geometry, not
 */
export const DESK_CHROME_STAGE_BODY_CLASS =
  'overflow-hidden rounded-b-xl bg-surface-card';

/** DataTable mount inside {@link DESK_CHROME_STAGE_BODY_CLASS} — flush, no inner rounded shell. */
export const DESK_TABLE_SURFACE_CLASS =
  'flex min-h-0 min-w-0 flex-1 flex-col rounded-none';

/**
 * The **lead column** — the Ask pane's share of every desk row.
 * not (operator 2026-09-04).
 */
const DESK_LEAD_PANE_WIDTH_CLASS = 'w-[360px] shrink-0';

/**
 * The lead column INSIDE the shared card:
 * above it (operator 2026-09-04).
 */
const DESK_LEAD_PANE_BODY_CLASS =
  'flex min-h-0 flex-col px-4 pt-4 border-r border-border-hairline';

/** The page **ground** the card sits on — WHITE (operator ruling 2026-08-31; owner 2026-09-26: one white page, only record columns lift). */
export const DESK_STAGE_GROUND_CLASS = 'bg-surface-card';

/* ── FIND stage — the third surface (operator ruling 2026-09-13) ────────────── */

/** Ground the FIND card floats on — a real step below card white. */
const FIND_STAGE_GROUND_CLASS = 'bg-surface-canvas';

/**
 * Breathing room around the FIND card. Wider than the desk's `pb-4` floor
 * because this card is detached on all four sides, not welded at the top.
 */
const FIND_STAGE_GUTTER_CLASS = 'px-4 pb-4 pt-3';

/* ── FIND on a PHONE — the card dissolves (operator law 2026-09-13) ────────── */

/** Ground the flush phone plane paints — card white, no canvas step. */
const FIND_STAGE_PHONE_GROUND_CLASS = 'bg-surface-card';

/** Phone measure: the viewport IS the measure, so there is no cap to center. */
const FIND_STAGE_PHONE_MEASURE_CLASS = 'w-full';

/** Phone gutter: none. Every px belongs to the row. */
const FIND_STAGE_PHONE_GUTTER_CLASS = '';

/** Which FIND measure a mount is painting at. */
export type FindStageDensity = 'compact' | 'comfortable';

/** The five classes that make one FIND stage. */
interface FindStageClasses {
  /** Page ground under the plane. */
  ground: string;
  /** Measure + centering of the plane. */
  measure: string;
  /** Gutter between the measure and the plane. */
  gutter: string;
  /** Plane corners. */
  corner: string;
  /** Plane depth. */
  elevation: string;
}

/** The whole FIND stage decision, per density — ground, measure, gutter, corner and depth as ONE record, because they are one decision. */
export const FIND_STAGE_BY_DENSITY: Record<FindStageDensity, FindStageClasses> = {
  comfortable: {
    ground: FIND_STAGE_GROUND_CLASS,
    measure: DESK_STAGE_FIXED_CLASS,
    gutter: FIND_STAGE_GUTTER_CLASS,
    corner: cornerClass('surface'),
    elevation: elevationClass('raised'),
  },
  compact: {
    ground: FIND_STAGE_PHONE_GROUND_CLASS,
    measure: FIND_STAGE_PHONE_MEASURE_CLASS,
    gutter: FIND_STAGE_PHONE_GUTTER_CLASS,
    corner: cornerClass('flush'),
    elevation: elevationClass('flat'),
  },
};
