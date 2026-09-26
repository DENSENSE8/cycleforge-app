/** Cycle-count LINES family verb catalog — declare once, resolve per row. */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { CycleCountLineRow } from '@/lib/inventory/cycle-count-line-row';

export interface CycleCountLineVerbHandlers {
  /** Open the count plane — the parameterised write's L2 record form. */
  onCount: (row: CycleCountLineRow) => void;
  onApprove: (row: CycleCountLineRow) => void;
  onReject: (row: CycleCountLineRow) => void;
  /** Is a write for this line already in flight? */
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
