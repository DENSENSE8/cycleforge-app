/** Which verbs a receiving rail row offers in its ⋮ menu — the declarative SoT, mirroring {@link RAIL_QTY} / {@link RAIL_STATUS}. */

import type { RailRowAction } from '@/components/sidebar/rail-shell/rail-row-actions';

/** Verbs, in menu order. Order here IS the order the operator reads. */
export type RailRowVerb = 'select' | 'share' | 'hide' | 'delete';

const RECEIVING_VERBS: readonly RailRowVerb[] = ['select', 'share', 'hide', 'delete'];

export const RAIL_ROW_ACTIONS = {
  /**
   * The scan surfaces — Unboxed · Door queue · At dock · Viewed · Triage ·
   * Unfound · Done. Every one has a `staff_rail_exclusions` feed key, so every
   * one can be hidden, and every row is a carton, so every one can be deleted.
   */
  receiving: { verbs: RECEIVING_VERBS },
  /** `/search` Recently searched. */
  searchRecent: { verbs: RECEIVING_VERBS.filter((v) => v !== 'hide') },
} as const satisfies Record<string, { verbs: readonly RailRowVerb[] }>;

/** Registry ids — the key a feed binds by (`rowActions: 'receiving'`). */
export type RailRowActionsId = keyof typeof RAIL_ROW_ACTIONS;

export interface RailRowActionHandlers {
  /** Hand out a link to this record. Null when the row has no carton to link. */
  share: (() => void) | null;
  /**
   * Reversible per-staff hide (`staff_rail_exclusions`). Null when the mounted
   * rail has no feed key to write to, which drops the verb.
   */
  hide: (() => void) | null;
  /** Irreversible org-wide carton delete. */
  remove: (() => void) | null;
  /** Enter bulk multi-select, pre-checking this row. */
  select: (() => void) | null;
}

export function buildRailRowActions(
  id: RailRowActionsId,
  handlers: RailRowActionHandlers,
): RailRowAction[] {
  const out: RailRowAction[] = [];

  for (const verb of RAIL_ROW_ACTIONS[id].verbs) {
    switch (verb) {
      case 'select': {
        const select = handlers.select;
        if (select) {
          out.push({ id: 'select', label: 'Select', icon: 'select', group: 'read', onSelect: select });
        }
        break;
      }
      case 'share': {
        const share = handlers.share;
        if (share) {
          out.push({ id: 'share', label: 'Share link', icon: 'share', group: 'read', onSelect: share });
        }
        break;
      }
      case 'hide': {
        const hide = handlers.hide;
        if (hide) {
          out.push({
            id: 'hide',
            label: 'Hide from my list',
            icon: 'hide',
            group: 'mine',
            // Reversible, so it fires immediately with an Undo — never a
            // confirm, which taxes every correct action to guard a rare
            // accident. Only the irreversible verb below earns the interruption.
            onSelect: hide,
          });
        }
        break;
      }
      case 'delete': {
        const remove = handlers.remove;
        if (remove) {
          out.push({
            id: 'delete',
            label: 'Delete carton',
            icon: 'delete',
            // Its own group, below a divider, tinted — never adjacent to Hide.
            // "carton" is in the LABEL because the blast radius is the whole
            // package for the whole org, not the one line the operator clicked.
            group: 'danger',
            onSelect: remove,
          });
        }
        break;
      }
    }
  }

  return out;
}
