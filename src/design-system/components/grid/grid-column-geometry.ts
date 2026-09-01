/**
 * Ledger grid column GEOMETRY — track width, header fit, content floor, and the
 * CSS grid template. One implementation, read by every surface.
 *
 * These four functions existed six times over (receiving · incoming · catalog ·
 * repair · pickup · ordersQueue), byte-identical apart from the type annotation
 * on the parameter. That is not merely duplication — it is duplication of a
 * DECISION, and it billed:
 *
 *   The header-fit test was made label-aware to stop Unbox rendering `UNBO…`
 *   into a track sized for a shorter placeholder. The fix landed on ONE of the
 *   six copies, so Incoming, Catalog, Repair, Pickup and Pending kept clipping
 *   for weeks after the bug was "fixed". A waist that has six bodies has no
 *   waist; the next fix would have paid the same tax.
 *
 * The chrome half lives in {@link ./grid-cell-chrome} (`ledgerGridCell` /
 * `LEDGER_GRID_FROZEN_CELL` / `ledgerGridRowShellClass`). This module owns the
 * geometry half; surface layouts keep named exports as thin aliases so call
 * sites are untouched.
 *
 * Every column model structurally satisfies {@link LedgerGridColumnModel}, so
 * these take the base type — no generics needed.
 */

import { gridFrozenKeys, isGridColumnFillTrack } from './grid-column-editability';

/**
 * Structural, dependency-free by design. Typing these against the concrete
 * `LedgerGridColumnModel` would import the descriptor module, which now imports
 * THIS one to derive `contentMinWidthRem` — a cycle. Every column model
 * satisfies these shapes anyway, so structural params keep this a leaf.
 *
 * (`grid-column-editability` is itself import-free, so composing `gridFrozenKeys`
 * below adds a one-way edge, not a cycle.)
 */
interface TrackLike {
  width: string;
}
interface HeaderLike extends TrackLike {
  key: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  headerGlyphOnly?: boolean;
  headerForceLabel?: boolean;
}
interface FrozenTrackLike extends TrackLike {
  key: string;
  frozen?: boolean;
}

/**
 * CSS custom property that overrides a column's track width (px), keyed by the
 * column key. Set on the grid surface; header + rows + group summaries inherit
 * it, which is what keeps a drag-resize in sync across all three.
 */
/**
 * Column keys are not all valid CSS ident tails. Org custom columns key as
 * `custom:<defKey>`, and a custom-property name **may not contain a colon** —
 * `var(--cf-col-custom:rack_slot, 5rem)` is a parse error, which invalidates the
 * whole `grid-template-columns` declaration and drops EVERY track on the row,
 * not just that one. Measured on Unbox History (2026-08-09): the row's inline
 * template came back empty and the computed value collapsed to a single
 * full-width track.
 *
 * Everything already in use (`title`, `qty`, `last_counted`, …) is unchanged by
 * this mapping, so it cannot move an existing surface.
 */
function cssIdentTail(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '-');
}

export function gridColVar(key: string): string {
  return `--cf-col-${cssIdentTail(key)}`;
}

/**
 * The column's rem floor, parsed from its `minmax(Xrem, …)` track.
 *
 * The `12` fallback is the flex-title default: only `title` uses
 * `minmax(12rem, 1fr)`, and a column whose width does not name a rem is that
 * flex track.
 */
export function gridColumnTrackRem(column: TrackLike): number {
  const m = column.width.match(/([\d.]+)rem/);
  return m ? Number(m[1]) : 12;
}

/**
 * Should this header render its text label, or fall back to the type glyph?
 *
 * FOUR gates, in order:
 *  - the column must not have DECLARED itself glyph-only (`headerGlyphOnly`),
 *  - the column may DECLARE the word always (`headerForceLabel` — photo gutter),
 *  - the track must clear the column's declared `labelFitRem` floor, and
 *  - the RESOLVED label must actually fit that track.
 *
 * The first gate is a statement of intent, not a measurement: `qty`'s header is
 * `#` because a quantity needs no word, at every track width. Expressing that
 * by starving `labelFitRem` instead makes the intent depend on geometry, so it
 * silently reverts to the word on the next drag-resize or density change; and
 * expressing it as `gridLabel: '#'` renders the glyph AND the label, which for
 * a `number` column is two hashes (shipped 2026-08-02, caught at the bench).
 *
 * The second gate is the one the per-surface copies lacked. A width threshold
 * only holds while the rendered label is the one the column SoT declares —
 * Unbox injects its stage label at runtime (`Unboxed` / `Scanned` / `Tested`)
 * over a track sized for the placeholder `Stage`, so `4.5 >= 4.5` passed and
 * the header clipped to `UNBO…`. A clipped header is worse than a glyph: the
 * glyph is a complete symbol an operator learns, while a truncated word has to
 * be decoded and can be misread.
 *
 * Pass `label` when the caller overrides it at runtime; otherwise the column's
 * own `gridLabel ?? label ?? key` is used.
 *
 * **A flex (`1fr`) column is exempt from the width gates.** Its `minmax(Xrem, 1fr)`
 * FLOOR is not its rendered width — a flex track is the surface's slack absorber,
 * so it renders at its 1fr share (wide) and only reaches the floor in the rare,
 * transient state where the sheet is scrolling horizontally. Measuring the floor
 * therefore understates the column and wrongly degrades a wide title (Product) to
 * a type glyph — exactly what happened when Product's floor was lowered to 4rem as
 * a resize-drain target while its label-fit stayed 8rem. A flex column always
 * shows its label; `headerGlyphOnly` still wins first for a deliberately mute track.
 */
export function gridHeaderShowsLabel(column: HeaderLike, label?: string): boolean {
  if (column.headerGlyphOnly) return false;
  if (column.headerForceLabel) return true;
  if (isFlexTrack(column)) return true;
  const trackRem = gridColumnTrackRem(column);
  if (trackRem < (column.labelFitRem ?? 4.5)) return false;
  return gridHeaderLabelFits(trackRem, label ?? column.gridLabel ?? column.label ?? column.key);
}

/** Sum of the visible tracks' rem floors — the surface's h-scroll activation width. */
export function gridContentMinWidthRem(columns: readonly TrackLike[]): number {
  return columns.reduce((sum, c) => sum + gridColumnTrackRem(c), 0);
}

interface KeyedTrackLike extends TrackLike {
  key: string;
}

/**
 * Live content-min width in px — SoT rem floors, with persisted drag-resize px
 * overrides replacing the rem for that track.
 *
 * `--cf-orders-grid-w` used to publish only the rem sum, so a staffer who
 * widened Product past the card left the row border-box viewport-wide while
 * `scrollWidth` grew; ResizeObserver never fired and the sticky X gutter
 * stayed collapsed. Fill / `1fr` floors that parse to `0rem` still add 0.
 */
export function gridContentMinWidthPx(
  columns: readonly KeyedTrackLike[],
  widths: Readonly<Record<string, number>> = {},
  remPx = 16,
): number {
  return columns.reduce((sum, c) => {
    // Trailing `_fill` absorbs slack — never part of the scroll activation floor.
    if (isGridColumnFillTrack(c)) return sum;
    const override = widths[c.key];
    if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
      return sum + override;
    }
    return sum + gridColumnTrackRem(c) * remPx;
  }, 0);
}

/**
 * Rem length scaled by spreadsheet / compact density (`--cf-density`).
 * Zoom hosts set the same var (see {@link gridZoomStyle}); default `1` leaves
 * SoT rem floors unchanged. Staff px overrides (`--cf-col-*`) stay absolute.
 */
export function densityScaledRem(rem: number): string {
  return `calc(${rem}rem * var(--cf-density, 1))`;
}

/**
 * `grid-template-columns` for the visible tracks, each overridable by its
 * per-column CSS var so a resize updates header, rows and summaries together.
 *
 * **A flex track stays flexible after a resize.** A column declared
 * `minmax(12rem, 1fr)` is the surface's FILL track — it is what makes the row
 * span the card. Substituting the whole declaration with `var(--cf-col-title)`
 * replaced `1fr` with a fixed px width, so the moment anything was dragged the
 * tracks summed to less than the card and the remainder rendered as a band of
 * empty white inside the card, to the right of the last column. Every other
 * column's drag produced it too, because there was then nothing left to absorb
 * the slack.
 *
 * So for a flex column the override sets its **floor**, not its width:
 * `minmax(var(--cf-col-KEY, calc(Nrem * var(--cf-density, 1))), 1fr)`. Fixed
 * tracks take the var wholesale (px drag) or a density-scaled rem floor.
 *
 * The trade, stated: dragging the fill column narrower than its 1fr share has
 * no visible effect while the grid still fits its card — there is no free space
 * for anyone else to take. It resizes normally once the grid is wide enough to
 * scroll horizontally, which is the only state in which "narrower" means
 * anything. A grid that never leaves a white gap is worth that.
 */
export function gridTemplate(columns: readonly (TrackLike & { key: string })[]): string {
  return columns
    .map((c) => {
      const floor = densityScaledRem(gridColumnTrackRem(c));
      return isFlexTrack(c)
        ? `minmax(var(${gridColVar(c.key)}, ${floor}), 1fr)`
        : `var(${gridColVar(c.key)}, ${floor})`;
    })
    .join(' ');
}

/** A track that absorbs the surface's leftover width (declared `…, 1fr)`). */
function isFlexTrack(column: TrackLike): boolean {
  return column.width.includes('1fr');
}

/**
 * The row's own left inset (`QUEUE_ROW.px` = `px-3`, density-aware). The frozen
 * pane must include it or every pinned cell drifts left by that amount when the
 * body scrolls, because the grid content starts *inside* the row padding.
 *
 * The Pending Grid skin sets `--cf-queue-row-px: 0px` on `[data-grid-skin]` so
 * frozen cells flush to the shell edge.
 *
 * Module-private on purpose — the only caller is {@link gridFrozenLeft} in this
 * file, and exporting it would re-open the door to a surface hand-rolling its
 * own offset out of the pieces. That is what ten local copies of this constant
 * were doing.
 */
const GRID_ROW_PX = 'var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1)))';

/**
 * Sticky-`left` offset for a frozen cell — the row inset plus the width vars of
 * the frozen columns *before* it, so the pane pins on its own column origin and
 * follows a drag-resize with no extra machinery.
 *
 * **The fallback must be a LENGTH, and that is the whole reason this function
 * exists here.** Ten surfaces each carried a byte-identical copy that pushed
 * `var(--cf-col-KEY, ${col.width})` — and `col.width` is the grid-track string
 * `minmax(2rem, 2rem)`. `minmax()` is a grid-track function, illegal inside
 * `calc()`, so the moment any frozen column preceded another the whole `calc()`
 * was invalid and `left` computed to **`auto`**: the pane silently did not pin
 * at all, on every family, unless a staffer happened to have drag-resized every
 * preceding frozen column (which sets the var to a real px value and hides it).
 * Measured in Chrome at 16px root: the emitted value resolved to `auto`, the
 * same expression with rem fallbacks to `116px`. So the fallback is the track's
 * rem FLOOR ({@link gridColumnTrackRem}), never its declaration.
 *
 * **It also has to read the SURFACE's own pane.** Four layouts aliased the
 * orders-queue copy, whose closure sums `ORDERS_QUEUE_COLUMNS` — a
 * `select · order · title` pane — onto grids that freeze `select · title`.
 * Taking `columns` as a parameter is what makes one implementation correct for
 * every surface; the pane itself still comes from the model's own `frozen` flag
 * via {@link gridFrozenKeys}, so freeze, immovability and this offset stay one
 * declaration.
 *
 * A flex track contributes only its floor, which is exact while `title` is the
 * LAST frozen column in every family (nothing is offset past it). Freezing a
 * column *after* a flex track would need its resolved width, not its floor.
 */
export function gridFrozenLeft(columns: readonly FrozenTrackLike[], key: string): string {
  const frozen = gridFrozenKeys(columns);
  const idx = frozen.indexOf(key);
  const parts = [GRID_ROW_PX];
  for (const k of frozen.slice(0, Math.max(0, idx))) {
    const col = columns.find((c) => c.key === k);
    parts.push(
      `var(${gridColVar(k)}, ${col ? densityScaledRem(gridColumnTrackRem(col)) : '0px'})`,
    );
  }
  return `calc(${parts.join(' + ')})`;
}

/**
 * Does a header's resolved label fit its track, or must it degrade to the type
 * glyph? The invariant is **never clip; degrade** — a glyph is a complete symbol
 * an operator learns, a truncated word has to be decoded and can be misread.
 *
 * The constants are calibrated against MEASURED render metrics (Chrome, 16px
 * root, `/unbox` header), not guessed:
 *
 * | Part | Measured | rem |
 * |---|---|---|
 * | cell inset (`px-2` both sides) | 16px | 1.00 |
 * | type glyph + its gap | 12px + 4px | 1.00 |
 * | sort chevron + its gap | 12px + 4px | 1.00 |
 * | `UNBOXED` at role-eyebrow (10px condensed, 0.6px tracking) | 45.6px / 7 chars | 0.407/char |
 *
 * So base chrome is **2rem** (inset + glyph) and the char cost rounds up to
 * `0.42` to stay conservative. The earlier `1.75` under-reserved by 20px and
 * silently assumed the chevron was free — which is exactly how `UNBOXED` shipped
 * clipped once the column was sorted (77.6px fit in 80px, but 93.6px with the
 * chevron did not).
 *
 * There is no separate chevron budget: `GridHeaderLabel` paints a sort arrow
 * only while THIS column is the active sort, to the right of the title. The
 * 2rem chrome still budgets that arrow so activating a sort cannot clip a
 * label that fit while idle. Type glyphs are glyph-only / narrow tracks — they
 * never sit beside a visible title (text-first, 2026-08-04).
 */
const HEADER_CHAR_REM = 0.42;
const HEADER_CHROME_REM = 2;

function gridHeaderLabelFits(trackRem: number, label: string): boolean {
  return trackRem >= label.trim().length * HEADER_CHAR_REM + HEADER_CHROME_REM;
}
