/** Part-compatibility family verb catalog — declare once, resolve per row. */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { PartCompatibilityEdgeRow } from '@/lib/sourcing/part-compatibility-row';

export interface PartCompatibilityVerbHandlers {
  onRemove: (row: PartCompatibilityEdgeRow) => void;
}

/** Resolve the family's row verbs for one compatibility edge. */
export function resolvePartCompatibilityRowActions(
  row: PartCompatibilityEdgeRow,
  handlers: PartCompatibilityVerbHandlers,
): readonly CompoundRowAction[] {
  return [
    {
      key: 'remove',
      label: 'Remove',
      tone: 'danger',
      face: 'trailing',
      onSelect: () => handlers.onRemove(row),
    },
  ];
}
