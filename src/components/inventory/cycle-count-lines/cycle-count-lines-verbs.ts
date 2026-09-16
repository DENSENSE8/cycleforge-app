/**
 * Cycle-count LINES family verb catalog — declare once, resolve per row.
 *
 * Three verbs, and all three were cells:
 *
 * - **Count…** was an inline `<input type="number">` + Submit `<form>` living
 *   inside the Counted cell whenever `status === 'pending' && isOpen`. A
 *   compound row has no in-cell editor (`inCellEdit` is `false` on every
 *   family in this repo, and minting one is an engine change), and a
 *   `CompoundRowAction` carries a FIXED payload — so a write whose payload
 *   needs a parameter is a verb that OPENS A PLANE. It opens
 *   `CycleCountLinePlane` (a `DeskStageOverlay`), which is where the number
 *   gets typed.
 * - **Approve / Reject** were two `<form>`s in a trailing Action cell, one of
 *   them a raw solid-green `<button>` flagged `ds-raw-button` because no DS
 *   variant maps to green. Both are gone: the verbs paint on the engine's
 *   trailing `_fill` face with the house `secondary` / `dangerSoft` buttons.
 *
 * ## Why the preconditions read the ROW
 *
 * `VERBS_BIND_TO_FIELDS`: a verb's direction comes from row STATE, never from
 * the route or the mount. "Counting is closed" was `isOpen`, a campaign fact
 * the retired cells closed over; it is threaded onto each line
 * (`CycleCountLineRow.campaignOpen`) so the line answers for itself. On a
 * closed campaign this resolver returns NOTHING — absent, not disabled: there
 * is no direction left to offer, and a row of greyed controls on a finished
 * campaign is chrome pretending to be a choice.
 *
 * The mount supplies only what a catalog cannot hold — the plane's `useState`
 * and the three server actions.
 *
 * Callers: CycleCountLinesTable → useCycleCountLinesSpreadsheet.rowActions.
 */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { CycleCountLineRow } from '@/lib/inventory/cycle-count-line-row';

export interface CycleCountLineVerbHandlers {
  /** Open the count plane — the parameterised write's L2 record form. */
  onCount: (row: CycleCountLineRow) => void;
  onApprove: (row: CycleCountLineRow) => void;
  onReject: (row: CycleCountLineRow) => void;
  /**
   * Is a write for this line already in flight?
   *
   * The only lawful `disabled` on this family: it says "this same verb is
   * running", not "you may not do this". A precondition over row STATE is
   * expressed by NOT offering the verb (see the closed-campaign branch) —
   * disabling would leave a finished campaign wearing a row of dead controls.
   */
  isPending?: (row: CycleCountLineRow) => boolean;
}

/** Every verb key this family declares — the guard's SoT. */
export const CYCLECOUNTLINES_VERB_KEYS = ['count', 'approve', 'reject'] as const;

/** Resolve the family's row verbs for one cycle-count line. */
export function resolveCycleCountLineRowActions(
  row: CycleCountLineRow,
  handlers: CycleCountLineVerbHandlers,
): readonly CompoundRowAction[] {
  // A closed campaign writes nothing: `submitCount`, `approveLine` and
  // `rejectLine` all belong to an open count.
  if (!row.campaignOpen) return [];

  if (row.status === 'pending') {
    return [
      {
        key: 'count',
        label: 'Count…',
        face: 'trailing',
        onSelect: () => handlers.onCount(row),
      },
    ];
  }

  // The admin decision, offered on exactly the two states the retired Action
  // cell offered it on. `counted` is included because a within-tolerance line
  // can be approved early rather than waiting for the campaign to close.
  if (row.status === 'counted' || row.status === 'pending_review') {
    const busy = handlers.isPending?.(row) ?? false;
    return [
      {
        key: 'approve',
        label: 'Approve',
        face: 'trailing',
        disabled: busy,
        onSelect: () => handlers.onApprove(row),
      },
      {
        key: 'reject',
        label: 'Reject',
        tone: 'danger',
        face: 'trailing',
        disabled: busy,
        onSelect: () => handlers.onReject(row),
      },
    ];
  }

  // approved / rejected: the line is decided. Its provenance is the
  // `counted_by` track, the `approved_by` fact and the two Dates lines.
  return [];
}
