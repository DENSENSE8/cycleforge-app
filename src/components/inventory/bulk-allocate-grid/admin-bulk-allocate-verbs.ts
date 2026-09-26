/** Bulk-allocate family verb catalog — declare once, resolve per row. */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  candidateShortfallSentence,
  type AllocationCandidateRow,
} from '@/lib/inventory/allocation-candidate-row';

interface AdminBulkAllocateVerbHandlers {
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
