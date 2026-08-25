/**
 * Which verbs a receiving rail row offers in its ⋮ menu — the declarative SoT,
 * mirroring {@link RAIL_QTY} / {@link RAIL_STATUS}. A feed declares an id
 * (`rowActions: 'receiving'`); this module returns the items. No rail
 * hand-rolls a menu, exactly as no rail hand-rolls a status dot.
 *
 * ## The vocabulary, by blast radius
 *
 * | Verb   | Group    | Scope                      | Reversible |
 * |--------|----------|----------------------------|------------|
 * | Select | `read`   | nothing (enters bulk mode) | n/a        |
 * | Share  | `read`   | nothing                    | n/a        |
 * | Hide   | `mine`   | this staffer's rail         | yes — Undo |
 * | Delete | `danger` | the org's carton record     | **no**     |
 *
 * **Select replaced the resident pencil.** The rail used to carry a permanent
 * pencil toggle above the list to enter bulk multi-select; it is gone
 * (2026-08-24) and the same entry point now lives here, on the row it acts
 * from, so the list has one hover affordance instead of two.
 *
 * **It carries actions, not identity.** Copy tracking / Copy PO lived here
 * briefly and were removed 2026-08-22: the hover peek opens flush against the
 * same row and already lists every identity as a typed `CopyChip`, so the menu
 * was offering a second, worse door onto values that were on screen beside it.
 *
 * **Hide and Dismiss are one verb, not two.** The directive that opened this
 * work listed both; there is exactly one implementation
 * (`staff_rail_exclusions`) and one honest label, so the menu says what it
 * actually does — hides the row from YOUR list — rather than offering the same
 * behaviour under two words, which is how the old bulk bar came to read as a
 * delete.
 *
 * **There is no Open.** Clicking the row opens it, on every pointer. An Open
 * item would only repeat the gesture that opened the menu.
 *
 * The rails do not all support the same verbs, and neither does every row or
 * every operator: a Recently-searched row has no `staff_rail_exclusions` feed
 * key, a lineless stub has no carton to link or delete, and an operator without
 * `receiving.mark_received` may not delete at all. **A verb that cannot be
 * performed is omitted, not disabled** — a dead item in a three-item menu is
 * two items of noise and one dead end. Availability is therefore checked twice:
 * once statically here (does this FEED have the verb) and once by the caller,
 * which passes `null` for anything this row / this operator cannot do.
 *
 * Pure and renderer-free: the caller injects the implementations, so this is
 * unit-testable without React, a query client, or a clipboard.
 */

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
  /**
   * `/search` Recently searched. Same rows, but `railExclusionFeedKey` returns
   * null for this feed — there is nowhere to record a hide, so the verb is
   * absent rather than present-and-broken. Delete stays: the row is a real
   * carton and deleting it is the same act it is anywhere else.
   */
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
  /**
   * Irreversible org-wide carton delete. Null when the row has no carton, or
   * when the operator lacks `receiving.mark_received` — the permission the
   * DELETE route itself enforces. Offering a button that 403s is worse than
   * not offering it.
   */
  remove: (() => void) | null;
  /**
   * Enter bulk multi-select, pre-checking this row. Null when the mounted
   * rail has no edit-mode provider (`RailEditModeProvider`) above it — e.g.
   * FBA / Testing docks — which drops the verb rather than offering a select
   * that has nowhere to render its checkboxes.
   */
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
