/**
 * Non-scan **desk stage** measure — SoT for {@link DeskPageChrome}'s content frame.
 *
 * Two different surfaces, two different laws (`docs/todo/desk-page-chrome-fixed-width-PLAN.md` §0):
 *
 * | Surface | Measure |
 * |---|---|
 * | Scan station (Unbox · Arrival · Testing · Pack · Scan out) | edge-to-edge center, `STATION_WORKBENCH_LOCK_PX` **floor** |
 * | Non-scan desk (To ship · later ports) | fixed **max** width + centered gutters (here) |
 *
 * Edge-to-edge is right when the operator is scanning: the middle is the whole
 * job and density wins. It is wrong when they are triaging a spreadsheet queue
 * with a mouse — a table that re-measures itself to whatever monitor it landed
 * on gives no stable column positions to aim at, and the eye travels the full
 * width of a 27" display to get from the order number to the ship-by date.
 *
 * **Never reuse `STATION_WORKBENCH_LOCK_PX` (720) as the desk max.** It is a
 * *floor* on an elastic column, not a ceiling, and it is sized for a scan
 * bench. Borrowing it here would crush the desk grid to less than a third of a
 * laptop screen.
 */

import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';

/**
 * Desk stage ceiling (px). Twin of the `max-w-6xl` (72rem) in
 * {@link DESK_STAGE_FIXED_CLASS} — change both together.
 *
 * **Why 1152.** The narrowest Mac-class laptop workbench is the 13" MacBook Air
 * at 1470 CSS px. The warehouse shell spends 240 of that on the spine
 * (`SIDEBAR_SPINE_WIDTH`), leaving a ~1230px content column — so 1152 leaves a
 * real ~39px gutter per side on the *smallest* machine the desk targets, and
 * every larger display widens the gutters instead of stretching the table. The
 * value is one product constant, not a per-page guess: a second desk that
 * picks its own width is the fork this module exists to prevent.
 *
 * Reclaiming the full canvas is what fullscreen is for — one click, no tween.
 */
export const DESK_STAGE_MAX_PX = 1152;

/**
 * Default stage: centered, capped at {@link DESK_STAGE_MAX_PX}. The grid inside
 * may still scroll horizontally when its columns exceed the stage; the PAGE
 * does not become a full-bleed spreadsheet.
 */
export const DESK_STAGE_FIXED_CLASS = 'mx-auto w-full max-w-6xl';

/**
 * Fixed measure for the ONE record column a desk walk opens over the stage —
 * the To-ship Labels walk's order form (parcel · ShipStation rates · buy
 * label). Twin of {@link DESK_RECORD_MEASURE_CLASS} — change both together.
 *
 * **Why fixed, not `max-w`.** A record column that re-measures to the pane
 * moves every field, rate row and Buy button whenever the window, the
 * fullscreen toggle or the scrollbar changes — and the paperwork card flips
 * between stacked and side-by-side at its container breakpoint. The operator
 * works this column order after order; its controls must stay where the hand
 * left them.
 *
 * **Why 736.** The stage caps at {@link DESK_STAGE_MAX_PX} (1152). The walk's
 * queue rail takes 352 (`w-[22rem]`), leaving 800 for the record pane. 736
 * (border-box, its own `px-6` inside) leaves 64 of that for a reserved
 * scrollbar gutter plus slack, so on every machine the desk targets the column
 * is exactly this wide; only a pane narrower than the column (a small window)
 * scrolls it sideways instead of squeezing it.
 */
export const DESK_RECORD_MEASURE_PX = 736;

/** Tailwind twin of {@link DESK_RECORD_MEASURE_PX} (46rem). */
export const DESK_RECORD_MEASURE_CLASS = 'w-[46rem]';

/** Fullscreen stage: the gutters collapse and the body takes the content canvas. */
export const DESK_STAGE_FULLSCREEN_CLASS = 'w-full';

/**
 * Gutter the fixed stage sits in. Only paints when the stage is capped —
 * fullscreen means flush, or it would not be full.
 */
export const DESK_STAGE_GUTTER_CLASS = 'px-4';

/**
 * The **floor** under the card (operator ruling 2026-08-31).
 *
 * The stage used to end at the viewport, so the card's bottom edge was the
 * screen's bottom edge: the table did not look like an object on a page, it
 * looked welded to the chrome. A card flush at the bottom is the half an
 * operator stares at while scrolling a queue.
 *
 * 16px (`pb-4`). The card welds to the tab row above
 * ({@link DESK_STAGE_DETACH_CLASS} is empty); this floor is the remaining
 * breathing room so the card still sits on the page rather than welding to
 * the viewport.
 *
 * Not painted in fullscreen: flush is the entire point of that mode.
 */
export const DESK_STAGE_FLOOR_CLASS = 'pb-4';

/**
 * Desk **corner + inset** grammar — the deliberate split from the scan-station
 * chrome (operator ruling 2026-08-30).
 *
 * The design system's chrome was flattened for the SCAN STATIONS: flush
 * corners, zero inset, edge-to-edge bands. That is correct at a bench, where
 * the middle column is the whole job and every pixel of chrome is a pixel not
 * spent on the scan. It is wrong on a pointer-driven desk, where the stage is
 * deliberately narrower than the canvas and the chrome needs to read as a
 * CARD sitting on that canvas rather than as a band bleeding off both edges.
 *
 * So the two surfaces split here, on purpose:
 *
 * | Surface | Band height | Corners | Inset |
 * |---|---|---|---|
 * | Scan station | `PRIMARY_CHROME_ROW_FACE` (28px) | flush, edge-to-edge | none (`STATION_WORKBENCH_BODY_PAD_X` is `''`) |
 * | Non-scan desk | header ~56px + tab row 36px | rounded card | this gutter + these paddings |
 *
 * Do not "unify" these back together. They were one token once, and unifying
 * them is what put a scan-bench measure on a triage desk in the first place.
 *
 * The same split applies to **fields**: `TextField appearance="flush"` (floating
 * label, square cell) is the scan-station import. Desk record walks
 * (exceptions, Labels, Incoming add) paint `TriageScrollLayout` cards with
 * `cornerClass('surface')` and Label + Input via `triagePanelControl`. The
 * Omni Composer (`StationComposerHost`) may sit at the foot of a desk walk —
 * it already uses `COMPOSER_SHELL_CORNER`, not the flush field face.
 */

/**
 * The **page header row** — title left, primary CTA right.
 *
 * Vertical padding only. The row sits INSIDE the stage measure and carries no
 * horizontal inset of its own, because the whole point of the header is that
 * the title's left edge and the table card's left edge are one vertical line.
 * A `px-4` here would push the title four units off the column it names.
 *
 * ~56px tall at `text-role-title` (18px × 1.3) + `py-3` — a page-header
 * altitude, not the 28px band a scan station wears.
 */
export const DESK_PAGE_HEADER_ROW_CLASS = 'py-3';

/**
 * The **tab row**, on its own line under the header.
 *
 * Full-width bottom hairline (`border-border-hairline`) is the seam under
 * Pending · To ship · Amazon Prep · … — one rule across the whole band, not
 * a dash only under the active tab. Each tab's own `border-b` + `-mb-px`
 * (DeskPageChrome) lands on this pixel so the active tab's dark segment
 * replaces the soft rule instead of stacking a second line. Do not add an
 * `overflow-*` to the row or its tablist.
 */
export const DESK_TAB_ROW_CLASS = 'h-9 border-b border-border-hairline';

/**
 * Shared tab-list geometry for every desk page. The list remains a normal
 * left-to-right row; fixed-width triggers own their label alignment.
 */
export const DESK_TAB_LIST_CLASS =
  'flex min-w-0 flex-1 items-stretch gap-1';

/** Shared fixed-width desk-tab face with a centered label. */
export const DESK_TAB_TRIGGER_CLASS =
  'ds-raw-button inline-flex shrink-0 items-center justify-center gap-1 px-3 text-center text-role-caption';

/**
 * Space between the tab row and the table card.
 *
 * Empty (operator 2026-09-04): the card welds to the tab row so the filter
 * field sits under the tabs. Do not restore `mt-5` / `mt-4` here — that gap
 * is the padding the operator asked to kill. Detachment is the floor
 * ({@link DESK_STAGE_FLOOR_CLASS}) plus the card's radius, not a band of
 * empty page between tabs and data.
 */
export const DESK_STAGE_DETACH_CLASS = '';

/**
 * The desk **card shell** — rounded container under the tab row.
 *
 * Only THIS shell carries corner radius on a pointer desk. The tab band sits
 * on the page ground; the card welds to the tab row. `overflow-hidden` +
 * `rounded-b-xl` clips the grid to the card's floor shoulders — the DataTable
 * itself stays edge-to-edge inside (see {@link DESK_TABLE_SURFACE_CLASS}).
 * Top corners are square so the toolbar welds to the tab row.
 *
 * NO outer border or hairline (operator ruling 2026-08-31). Soft geometry, not
 * a ring around the grid.
 */
export const DESK_CHROME_STAGE_BODY_CLASS =
  'overflow-hidden rounded-b-xl bg-surface-card';

/**
 * DataTable mount inside {@link DESK_CHROME_STAGE_BODY_CLASS} — flush, no inner
 * rounded shell. Toolbar + grid bleed to the card edges; the card clips corners.
 *
 * Do not wrap DataTable in a second `rounded-*` / border / shadow — that reads
 * as a box inside a box and breaks the breathable desk profile.
 */
export const DESK_TABLE_SURFACE_CLASS =
  'flex min-h-0 min-w-0 flex-1 flex-col rounded-none';

/**
 * The **lead column** — the Ask pane's share of every desk row.
 *
 * ONE width token, used in all three rows ({@link DeskPageChrome} header,
 * tab band, card) so the pane and the desk column cannot drift out of
 * alignment: every horizontal rule on the page — the title baseline, the tab
 * hairline, the card's top and bottom edges — is drawn by a row that spans
 * BOTH columns, not by a second stack of chrome beside the first.
 *
 * That is why the pane is not its own card. Two cards meant two headers, two
 * reserved tab rows and two detach gaps, and the pane's card sat 9px higher
 * than the table's because the desk header carries a CTA and the pane's did
 * not (operator 2026-09-04).
 */
export const DESK_LEAD_PANE_WIDTH_CLASS = 'w-[360px] shrink-0';

/**
 * The lead column INSIDE the shared card: divider against the grid, and an
 * inset because a composer sits IN the card while a DataTable bleeds to its
 * edges ({@link DESK_TABLE_SURFACE_CLASS}). The inset is also what keeps the
 * mouth's raised shadow and focus ring clear of the card's clipping edge.
 *
 * **No bottom inset** — that is the alignment, not an oversight. The mouth is
 * bottom-anchored and its mode row (`ComposerModeRow`: Ask + the context ring)
 * carries the composer's own 4px floor, so a flush column bottom lands that row
 * on the same centre line as the table's status bar — the desk's row count sits
 * across the card from the mode and the ring, on one band, instead of 20px
 * above it (operator 2026-09-04).
 */
export const DESK_LEAD_PANE_BODY_CLASS =
  'flex min-h-0 flex-col px-4 pt-4 border-r border-border-hairline';

/**
 * The page **ground** the card sits on — WHITE (operator ruling 2026-08-31).
 *
 * This was `bg-surface-canvas`, a grey wash, on the argument that a card the
 * same colour as its ground is a border and not a card. The operator's answer
 * is that a warehouse desk is not a dashboard of widgets: the grey read as a
 * gutter around a boxed-in table, and the page should read as one white sheet
 * with the data sitting on it. Detachment now comes from the card's own EDGE —
 * {@link DESK_CHROME_STAGE_BODY_CLASS} keeps its radius, and
 * {@link DESK_STAGE_FLOOR_CLASS} keeps the floor — separation by edge, not by
 * a gap above the card.
 *
 * Not painted in fullscreen: there is no ground left to see.
 */
export const DESK_STAGE_GROUND_CLASS = 'bg-surface-card';

/* ── FIND stage — the third surface (operator ruling 2026-09-13) ──────────────
 *
 * A third measure joins the two at the top of this file:
 *
 * | Surface | Measure | Corners | Depth |
 * |---|---|---|---|
 * | Scan station | edge-to-edge, 720 floor | flush | none |
 * | Non-scan desk | 1152 max, centered | rounded card, welded to the tab row | none — edge only |
 * | FIND (`/search?q=`) | 1152 max, centered | rounded on ALL FOUR corners | RAISED |
 *
 * Why FIND differs from a desk on both of the last two columns:
 *
 * **Four corners, not two.** A desk card welds its top edge to a tab row, so
 * its top corners are square by construction. FIND has no tab row above the
 * results — the band above it is the refine toolbar, which belongs INSIDE the
 * card (it acts on the rows in it). With nothing to weld to, a card with two
 * square corners reads as a panel that lost its header.
 *
 * **Depth, not just an edge.** The desk ruling was "separation by edge, not by
 * a gap" on a WHITE ground, which is right for a queue an operator lives in
 * all day. FIND is a transient plane the operator arrives at, reads, and
 * leaves — so it is an OBJECT on the page rather than the page itself, and it
 * says so by casting a shadow. That is why the ground here is
 * {@link FIND_STAGE_GROUND_CLASS} (`surface-canvas`) and not the desk's white.
 *
 * CAVEAT since 2026-09-15: light's canvas is now #fafafa — a 2% step under card
 * white, not the ~6% this paragraph was written against (operator: pin FAFAFA
 * as the standard light background). The shadow still has a plane, but a much
 * weaker one: on light, FIND reads as raised mostly by its CORNER and its
 * edge. If it stops reading as an object, give it a hairline — do not darken
 * the theme plane back, which is the ruling and not a regression
 * (`themes/light.ts`).
 *
 * Corner and shadow are both TOKENS — `cornerClass('surface')` and
 * `elevationClass('raised')` — never a `rounded-xl` / `shadow-*` literal, so
 * `ds_tokens` can see them and a theme can move them.
 */

/** Ground the FIND card floats on — a real step below card white. */
export const FIND_STAGE_GROUND_CLASS = 'bg-surface-canvas';

/**
 * Breathing room around the FIND card. Wider than the desk's `pb-4` floor
 * because this card is detached on all four sides, not welded at the top.
 */
export const FIND_STAGE_GUTTER_CLASS = 'px-4 pb-4 pt-3';

/* ── FIND on a PHONE — the card dissolves (operator law 2026-09-13) ──────────
 *
 * Everything above this line is the DESK answer and it stays. What follows is
 * the same plane at handheld measure, and the answer is not "the desk card,
 * smaller".
 *
 * A card is a statement about FIGURE AND GROUND: this object sits ON the page.
 * Three things have to be true for that statement to land — a measure the
 * object is narrower than, a ground it is inset from, and a plane its shadow
 * can fall across. On a 390px viewport none of them is:
 *
 * - **Measure.** `DESK_STAGE_FIXED_CLASS` caps at 1152 and centers. At 390 the
 *   cap never binds, so `mx-auto max-w-6xl` is three utilities that compute to
 *   `w-full` — a ceiling nothing reaches is not a measure.
 * - **Ground.** `FIND_STAGE_GUTTER_CLASS` spends 16px on each side. That is
 *   8% of the viewport traded for the idea of an edge, taken out of the one
 *   column the operator actually reads, and it is the width that decides
 *   whether a tracking number truncates.
 * - **Plane.** `elevationClass('raised')` needs canvas BEHIND the card to read
 *   as depth. A surface that fills the screen has nothing behind it, so the
 *   shadow lands on the viewport bezel: cost paid, nothing bought.
 *
 * So the phone FIND plane is FLUSH — card-white to all four edges, square
 * corners, flat. The separator is the row edge, which is the same ruling the
 * desk took on 2026-08-31 ("separation by edge, not by a gap") arriving here
 * for the opposite reason: there the card had a tab row to weld to, here it
 * has the viewport.
 *
 * This is expressed as a DESCRIPTOR, not five loose exports, because the five
 * values are one decision. A component that reaches for `FIND_STAGE_GROUND_
 * CLASS` and then picks its own corner has re-opened the question in the
 * caller, which is exactly how `px-4` ended up on a phone.
 */

/** Ground the flush phone plane paints — card white, no canvas step. */
export const FIND_STAGE_PHONE_GROUND_CLASS = 'bg-surface-card';

/** Phone measure: the viewport IS the measure, so there is no cap to center. */
export const FIND_STAGE_PHONE_MEASURE_CLASS = 'w-full';

/** Phone gutter: none. Every px belongs to the row. */
export const FIND_STAGE_PHONE_GUTTER_CLASS = '';

/**
 * Which FIND measure a mount is painting at. Deliberately the ROW's axis
 * (`SearchRowDensity`) and not a device name: a narrow desktop station pane is
 * `compact` too, and `SearchResultRow` has refused a viewport query for this
 * since 2026-09-12 precisely because devices and measures are different facts.
 */
export type FindStageDensity = 'compact' | 'comfortable';

/** The five classes that make one FIND stage. */
export interface FindStageClasses {
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

/**
 * The whole FIND stage decision, per density — ground, measure, gutter, corner
 * and depth as ONE record, because they are one decision.
 *
 * `SearchBrowseShell` indexes this and spreads the result; it never picks a
 * corner or a shadow of its own. Corner and depth resolve through
 * `cornerClass` / `elevationClass`, so `ds_tokens` still sees token ROLES
 * rather than a `rounded-xl` literal, and a theme that moves `surface` moves
 * the FIND card with it.
 */
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

