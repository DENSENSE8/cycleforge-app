/**
 * Bulk-allocate family verb catalog — declare once, resolve per row.
 *
 * Allocate is the desk's ONE verb. It used to be a seventh COLUMN of JSX: a
 * `<form action={allocateOne}>` wrapping a hidden input, a `HoverTooltip` and
 * a `<Button>` that was `disabled` on an ineligible row — a per-family cell by
 * another name, and the reason this table could never mount the shared row.
 * It is now `face: 'trailing'`, so it paints a sticky control in the `_fill`
 * slack track and reaches the row menu at the same time, and the mount
 * supplies only the thing a verb catalog cannot hold: the server action.
 *
 * ## Why an ineligible row still offers a DISABLED verb
 *
 * The two lawful answers were an empty action list or `disabled: true`. An
 * empty list is cleaner, and it is wrong here: the retired control was a
 * disabled `<Button>` whose tooltip said *"Need 3 stocked, only 1
 * available"*, and that sentence is the only thing on the row that tells an
 * operator HOW SHORT the SKU is. Deleting the verb deletes the sentence and
 * sends them to the SKU page to count. So the verb stays, disabled, WEARING
 * the shortfall as its label — and the same sentence also rides the state
 * pill's hover (`stateTip`), so it survives in both places a human looks.
 *
 * `onSelect` is the same callback on both branches. The engine never invokes a
 * disabled action, and a second no-op closure would be a lie about what the
 * verb does rather than a guard against it.
 *
 * Callers: AllocationCandidatesTable → useAdminBulkAllocateSpreadsheet.rowActions.
 */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  candidateShortfallSentence,
  type AllocationCandidateRow,
} from '@/lib/inventory/allocation-candidate-row';

export interface AdminBulkAllocateVerbHandlers {
  /** Runs the per-row server action. Supplied by the mount, never by the catalog. */
  onAllocate: (row: AllocationCandidateRow) => void;
  /** True while this row's allocation is in flight. */
  isPending?: (row: AllocationCandidateRow) => boolean;
}

/** Resolve the family's row verbs for one allocation candidate. */
export function resolveAdminBulkAllocateRowActions(
  row: AllocationCandidateRow,
  handlers: AdminBulkAllocateVerbHandlers,
): readonly CompoundRowAction[] {
  const shortfall = candidateShortfallSentence(row);
  const pending = handlers.isPending?.(row) ?? false;
  return [
    {
      key: 'allocate',
      label: shortfall ?? (pending ? 'Allocating…' : 'Allocate'),
      face: 'trailing',
      disabled: shortfall !== null || pending,
      onSelect: () => handlers.onAllocate(row),
    },
  ];
}
