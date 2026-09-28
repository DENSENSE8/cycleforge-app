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
 * Floor (industrial) places the record in a RIGHT RAIL (owner 2026-09-27:
 * "keep the right rail displaying details of the selection, edge to edge"):
 * the list runs from the viewport's left edge to the rail, no gutter, no
 * measure; the rail is a fixed width to the viewport's right edge and is
 * always mounted, so the list never changes width as records open and close.
 */
export const DESK_FLOOR_LIST_CLASS = 'flex min-h-0 min-w-0 flex-1 flex-col';

/** The Floor record rail beside {@link DESK_FLOOR_LIST_CLASS}. */
export const DESK_FLOOR_RAIL_CLASS = 'flex w-[30rem] shrink-0 flex-col';

/**
 * A TRIAGE rail — the fixed-width queue or evidence column a triage desk keeps
 * beside its work (the Labels walk's queue, the label intake desk's labels):
 * 22rem, never a share of the viewport, so the work column beside it is the
 * only thing that grows. It borrows nothing from the Floor ledger's industrial
 * rows; callers add the one `border-mode-divide` seam on the side it touches.
 */
export const DESK_TRIAGE_RAIL_CLASS = 'flex w-[22rem] shrink-0 flex-col bg-mode-bar';

/**
 * The record beside a {@link DESK_TRIAGE_RAIL_CLASS} list — a rail desk
 * (`DeskRecordPlane` `listRail`, Labels & docs): the record is the work, so it
 * takes every pixel the rail leaves, in place (the fixed stage) and split
 * (the full canvas) alike.
 */
export const DESK_RAIL_RECORD_CLASS = 'flex min-w-0 flex-1 flex-col';

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
 * corner and the raised shadow on the white page. Industrial (the Floor rail)
 * drops the box: no frame, no lift, no inset — each column runs the rail's full
 * width, closed by one `divide` hairline (owner 2026-09-27).
 */
export const DESK_RECORD_COLUMN_CARD_CLASS = `flex min-w-0 flex-col overflow-hidden rounded-mode border border-mode-frame bg-mode-bar ${elevationClass('raised')} industrial:border-x-0 industrial:border-t-0 industrial:border-b-mode-divide industrial:shadow-none`;

/**
 * The split LIST's body (owner 2026-09-26): full width of its two thirds with
 * the gutter padding, a plain scrollable list — no card, no rounded or
 * floating bottom edge, no in-page wrapper.
 */
export const DESK_SPLIT_LIST_CARD_CLASS = 'flex min-h-0 min-w-0 w-full flex-1 flex-col';

/* ── ORDER CARD disclosure — the To-ship card list (owner 2026-09-27) ────────── */

/**
 * One 24 px line box for every fact on a card's lines 1 and 3 — order number,
 * platform, buyer, chips, Listing, SLA, "+N items", Details, the stage — so
 * nothing sits taller or lower than its neighbour.
 */
export const CARD_FACT_BOX_CLASS = 'inline-flex h-6 shrink-0 items-center';

/**
 * Width tiers of the card face, read off the card's own container
 * (`@container/card`) — never the viewport, so the split's narrow list and a
 * full-width list disclose from the same rules. Everything a tier hides is in
 * a hover tooltip and in the quick look (Space).
 *
 * - `brand` (@md) — the platform NAME beside its brand dot.
 * - `label` (@xl) — words beside icons: "Listing", the stage word.
 * - `detail` (@2xl) — the buyer name, the stage's PST time.
 *
 * `show*` = hidden below the tier, painted from it (one per display type);
 * `hideAt` = painted below the tier, hidden from it (the short twin).
 * Full literal strings — Tailwind 4 must see every variant in source.
 */
export const CARD_DISCLOSE = {
  brand: { show: 'hidden @md/card:inline' },
  label: { show: 'hidden @xl/card:inline', hideAt: '@xl/card:hidden' },
  detail: { flex: 'hidden @2xl/card:flex', inlineFlex: 'hidden @2xl/card:inline-flex' },
} as const;

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
 * The desk stage under the tab row — planted on the one white page: no border,
 * no corner radius, no frame (owner 2026-09-27: "remove the framing and just
 * have a bottom of page shadow"). The list paints its own bottom scroll shadow.
 */
export const DESK_CHROME_STAGE_BODY_CLASS = 'overflow-hidden bg-surface-card';

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
