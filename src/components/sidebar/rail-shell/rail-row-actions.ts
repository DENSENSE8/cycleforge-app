/** Rail row overflow (⋮) menu — the contract between a rail's feed, which knows WHICH verbs one of its rows supports, and {@link… */

/** Semantic glyph token — {@link RailRowMenu} maps it to the house icon. */
export type RailRowActionIcon = 'copy' | 'share' | 'hide' | 'delete' | 'select';

/** Menu groups, in render order, separated by dividers. */
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

/** Resolve a row's menu items. */
export type RailRowActionsResolver<TRow> = (
  row: TRow,
  ctx: { openWorkspace: () => void; rowLabel: string },
) => RailRowAction[];
