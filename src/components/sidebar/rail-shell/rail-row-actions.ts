/**
 * Rail row overflow (⋮) menu — the contract between a rail's feed, which knows
 * WHICH verbs one of its rows supports, and {@link RailRowMenu}, which renders
 * them.
 *
 * Deliberately data-only: an item is a label, a semantic glyph token and a
 * callback — never a React node. That keeps the per-feed resolvers (see
 * `RAIL_ROW_ACTIONS` in `@/lib/receiving/rail/row-actions`) pure and testable
 * without a renderer, and keeps glyph choice in one place instead of at every
 * call site.
 *
 * A verb a given row cannot perform is **omitted, not disabled** — a disabled
 * item in a five-item menu is four items of noise and one dead end. Resolve to
 * an empty array and the row paints no ⋮ at all.
 */

/** Semantic glyph token — {@link RailRowMenu} maps it to the house icon. */
export type RailRowActionIcon = 'copy' | 'share' | 'hide' | 'delete' | 'select';

/**
 * Menu groups, in render order, separated by dividers.
 *
 * The split is by BLAST RADIUS, not by theme:
 *   - `read`   — takes a copy of something. Changes nothing, anywhere.
 *   - `mine`   — changes what THIS operator sees. Reversible; fires with an Undo.
 *   - `danger` — changes the org's record. Irreversible; earns a confirm.
 *
 * A per-staff hide and an org-wide delete sitting adjacent and undifferentiated
 * is exactly how the old bulk bar came to read as a delete. They are never
 * neighbours here.
 */
export type RailRowActionGroup = 'read' | 'mine' | 'danger';

export interface RailRowAction {
  /** Stable verb id — the React key and the test hook (`data-rail-row-action`). */
  id: string;
  label: string;
  icon?: RailRowActionIcon;
  /** Defaults to `read` — the group that cannot change anything. */
  group?: RailRowActionGroup;
  onSelect: () => void;
}

/** Group order in the menu. Dividers go between non-empty neighbours. */
export const RAIL_ROW_ACTION_GROUPS: readonly RailRowActionGroup[] = ['read', 'mine', 'danger'];

/**
 * Resolve a row's menu items.
 *
 * There is deliberately **no Open item**: the row's own click already opens the
 * record, on every pointer, and a menu whose first entry duplicates the gesture
 * that opened the menu is a wasted line. `openWorkspace` stays on the context
 * for a rail that genuinely needs to route somewhere else. `rowLabel` is the
 * row's operator-facing identity, already resolved by the shell, so an action's
 * own feedback ("Hid <title>") names the row the same way the ⋮ trigger's
 * accessible name does.
 */
export type RailRowActionsResolver<TRow> = (
  row: TRow,
  ctx: { openWorkspace: () => void; rowLabel: string },
) => RailRowAction[];
