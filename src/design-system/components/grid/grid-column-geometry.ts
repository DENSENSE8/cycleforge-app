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
 * The chrome half of this contract was already shared — `dashboard-order-row-
 * layout.ts` re-exports `ordersQueueGridCell` / `ordersQueueFrozenLeft` /
 * `ordersQueueRowShellClass` under per-surface aliases. This module finishes
 * that job for the geometry half; the surface layouts keep their named exports
 * as thin aliases so call sites are untouched.
 *
 * Every column model structurally satisfies {@link LedgerGridColumnModel}, so
 * these take the base type — no generics needed.
 */

/**
 * Structural, dependency-free by design. Typing these against the concrete
 * `LedgerGridColumnModel` would import the descriptor module, which now imports
 * THIS one to derive `contentMinWidthRem` — a cycle. Every column model
 * satisfies these shapes anyway, so structural params keep this a leaf.
 */
interface TrackLike {
  width: string;
}
interface HeaderLike extends TrackLike {
  key: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
}

/**
 * CSS custom property that overrides a column's track width (px), keyed by the
 * column key. Set on the grid surface; header + rows + group summaries inherit
 * it, which is what keeps a drag-resize in sync across all three.
 */
export function gridColVar(key: string): string {
  return `--cf-col-${key}`;
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
 * TWO gates, and both matter:
 *  - the track must clear the column's declared `labelFitRem` floor, and
 *  - the RESOLVED label must actually fit that track.
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
 */
export function gridHeaderShowsLabel(column: HeaderLike, label?: string): boolean {
  const trackRem = gridColumnTrackRem(column);
  if (trackRem < (column.labelFitRem ?? 4.5)) return false;
  return gridHeaderLabelFits(trackRem, label ?? column.gridLabel ?? column.label ?? column.key);
}

/** Sum of the visible tracks' rem floors — the surface's h-scroll activation width. */
export function gridContentMinWidthRem(columns: readonly TrackLike[]): number {
  return columns.reduce((sum, c) => sum + gridColumnTrackRem(c), 0);
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
 * `minmax(var(--cf-col-KEY, 12rem), 1fr)`. Fixed tracks are unchanged — they
 * still take the var wholesale, so their drags stay exact to the pixel.
 *
 * The trade, stated: dragging the fill column narrower than its 1fr share has
 * no visible effect while the grid still fits its card — there is no free space
 * for anyone else to take. It resizes normally once the grid is wide enough to
 * scroll horizontally, which is the only state in which "narrower" means
 * anything. A grid that never leaves a white gap is worth that.
 */
export function gridTemplate(columns: readonly (TrackLike & { key: string })[]): string {
  return columns
    .map((c) =>
      isFlexTrack(c)
        ? `minmax(var(${gridColVar(c.key)}, ${gridColumnTrackRem(c)}rem), 1fr)`
        : `var(${gridColVar(c.key)}, ${c.width})`,
    )
    .join(' ');
}

/** A track that absorbs the surface's leftover width (declared `…, 1fr)`). */
export function isFlexTrack(column: TrackLike): boolean {
  return column.width.includes('1fr');
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
 * There is no separate chevron budget: `GridHeaderLabel` renders ONE mark slot,
 * swapping the type glyph for the sort chevron while a column is sorted. That is
 * what keeps this a two-term calculation and keeps header geometry identical
 * across sort states.
 */
const HEADER_CHAR_REM = 0.42;
const HEADER_CHROME_REM = 2;

function gridHeaderLabelFits(trackRem: number, label: string): boolean {
  return trackRem >= label.trim().length * HEADER_CHAR_REM + HEADER_CHROME_REM;
}
