/**
 * Instrument readout — the class recipes for a machined data strip.
 *
 * ## The job
 *
 * A count an operator scans at eye level from a metre away is an INSTRUMENT,
 * not a chat suggestion. Before this module those counts shipped as
 * `rounded-full border border-border-hairline text-role-micro text-text-muted`
 * pills: 10px condensed prose ink inside a candy outline. Three tells, all of
 * them reading "toy":
 *
 *   1. **Pill radius.** `rounded-full` is reserved in this system for avatars,
 *      status dots and switches (DESIGN.md → Shapes). A pill around a number
 *      inside a squared console is the mixed-radius failure the taste pass
 *      calls a shape-lock break: round chips in a square layout.
 *   2. **Prose numerals.** The count rendered in the same condensed prose cut
 *      as its label, non-tabular, so the eye had to read the row instead of
 *      landing on the figure. This app already rules that quantities are
 *      Plex Mono, tabular, 600 (DESIGN.md → Typography, "mono only for strings
 *      an operator retypes" plus every qty column in the ledger).
 *   3. **Per-item borders.** Each count carried its own outline, so three
 *      counts read as three floating objects rather than one readout. Cards
 *      and outlines are for real elevation; a set of sibling figures groups
 *      with rules and negative space.
 *
 * ## The material
 *
 * "Brushed aluminium" at 28px tall is geometry and value, not texture: a
 * turbulence-displaced weave or a metal photo inside a chip is mud on a real
 * screen at real size. The metal read here is
 *
 *   • a 3% vertical value fall (`from-surface-card` → `to-surface-sunken`),
 *     which is how an anodised plate catches light on a screen,
 *   • one hairline bezel at `border-border-default`, no shadow, so the plate
 *     sits IN the surface rather than floating on it, and
 *   • machined cell divisions (`divide-x`) instead of gaps, so the strip reads
 *     as one part that was cut, not three parts that were arranged.
 *
 * Every value is a semantic token, so the plate re-tempers itself on Paper,
 * Ember and the dark schemes without a second recipe.
 *
 * ## Usage
 *
 * ```tsx
 * <div className={INSTRUMENT_PLATE}>
 *   <button className={INSTRUMENT_CELL}>
 *     <span className={INSTRUMENT_VALUE}>12</span>
 *     <span className={INSTRUMENT_LABEL}>order exceptions</span>
 *   </button>
 * </div>
 * ```
 *
 * Reach for these whenever a surface shows sibling COUNTS or short operator
 * verbs in a row. Do not reach for them for prose, for a single hero figure
 * (that is `text-role-display`), or for a table (that is the slot DataTable).
 */

/**
 * The plate. `items-stretch` so every cell divider runs the full height and the
 * strip cuts as one piece; `rounded-sm` (4px) is the chip corner from the
 * radius ladder, which is as much curvature as ops chrome takes.
 */
export const INSTRUMENT_PLATE =
  'inline-flex items-stretch divide-x divide-border-subtle overflow-hidden rounded-sm border border-border-default bg-gradient-to-b from-surface-card to-surface-sunken';

/**
 * One cell. Baseline-aligned so the figure and its legend sit on one optical
 * line; hover washes the CELL, not the plate, so the operator can see which
 * reading they are about to open.
 */
export const INSTRUMENT_CELL =
  'flex min-w-0 items-baseline gap-1.5 px-2.5 py-1 transition-colors hover:bg-surface-hover';

/**
 * The figure. Plex Mono 600 tabular at `role-data` (13px): tabular so a poll
 * that changes 9 to 10 does not shift the legend beside it, mono because this
 * system already reserves mono for quantities an operator reads and retypes.
 */
export const INSTRUMENT_VALUE =
  'font-mono text-role-data font-semibold tabular-nums text-text-default';

/**
 * The legend. `role-eyebrow` (11px condensed, 0.08em) UPPERCASE — a field
 * label, which this system permits uppercase, unlike a DATA header. One step
 * larger than the 10px `role-micro` it replaces, and in secondary ink rather
 * than muted, because a legend an operator cannot read at a glance is a legend
 * that made the figure meaningless.
 */
export const INSTRUMENT_LABEL =
  'truncate text-role-eyebrow uppercase text-text-muted';

/**
 * A cell whose whole content is a verb rather than a figure+legend pair (the
 * suggested-question strip). Sentence case at `role-caption` (12px/500): it is
 * a sentence to read, not a reading to scan, and it must not shout in the same
 * uppercase register as the legends above it.
 */
export const INSTRUMENT_ACTION_CELL =
  'flex min-w-0 items-center px-2.5 py-1 text-role-caption text-text-muted transition-colors hover:bg-surface-hover hover:text-text-default';
