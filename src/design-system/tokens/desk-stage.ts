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
 * looked welded to the chrome. A card detached at the top and flush at the
 * bottom is only half-detached, and the missing half is the one an operator
 * stares at while scrolling a queue.
 *
 * 20px, matching {@link DESK_STAGE_DETACH_CLASS} — the gap above the card and
 * the gap below it are the same measurement, or the card reads as sliding off
 * the screen rather than sitting on it.
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
 * The full-width hairline is load-bearing: it is what makes the active tab's
 * underline read as *the selected segment of a rule* rather than a dash
 * floating under a word.
 *
 * That only holds if the selection occupies THIS border's pixel. Each tab in
 * `DeskPageChrome` carries its own `border-b` pulled down by `-mb-px` to land
 * exactly here — so do not add an `overflow-*` to the tab row or its tablist,
 * do not pull the tablist with a negative margin (that hangs the selection
 * past this rule), and do not give the row bottom padding: any of those puts
 * the tabs' borders off this hairline.
 */
export const DESK_TAB_ROW_CLASS = 'h-9 border-b border-border-soft';

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
 * The **detachment gap** between the tab row and the table card — the single
 * measurement this layout exists for.
 *
 * 20px (`mt-5`), not 8. At 8 the column header still reads as a fourth chrome
 * row in one continuous slab and an operator scanning down cannot tell where
 * the page furniture stops and the data starts. The gap is what turns the
 * table into an object sitting on the page rather than the bottom of its
 * header.
 *
 * It carries more weight since the ground went white (2026-08-31): with no
 * fill contrast left, this gap is the whole of the detachment. Do not shrink
 * it to buy a row back.
 */
export const DESK_STAGE_DETACH_CLASS = 'mt-5';

/**
 * The desk **card shell** — rounded container detached from the chrome above.
 *
 * Only THIS shell carries corner radius on a pointer desk. The tab band sits
 * on the page ground above the detach gap; `overflow-hidden` + `rounded-xl`
 * clips the toolbar and grid to the card's shoulders — the DataTable itself
 * stays edge-to-edge inside (see {@link DESK_TABLE_SURFACE_CLASS}).
 *
 * NO outer border or hairline (operator ruling 2026-08-31). Detachment is
 * gap + soft geometry, not a ring around the grid.
 */
export const DESK_CHROME_STAGE_BODY_CLASS =
  'overflow-hidden rounded-xl bg-surface-card';

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
 * The page **ground** the card sits on — WHITE (operator ruling 2026-08-31).
 *
 * This was `bg-surface-canvas`, a grey wash, on the argument that a card the
 * same colour as its ground is a border and not a card. The operator's answer
 * is that a warehouse desk is not a dashboard of widgets: the grey read as a
 * gutter around a boxed-in table, and the page should read as one white sheet
 * with the data sitting on it. Detachment now comes from the card's own EDGE —
 * {@link DESK_CHROME_STAGE_BODY_CLASS} keeps its hairline and radius, and
 * {@link DESK_STAGE_DETACH_CLASS} keeps the gap — which is the same separation
 * carried by line rather than by fill.
 *
 * Not painted in fullscreen: there is no ground left to see.
 */
export const DESK_STAGE_GROUND_CLASS = 'bg-surface-card';
