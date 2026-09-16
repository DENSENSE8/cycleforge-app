/**
 * Part-compatibility family verb catalog — declare once, resolve per row.
 *
 * Remove is a destructive verb (`face: 'trailing'`), not a catalog field and
 * not a remounted compound `actions` track. The desk carried it as a sixth
 * column of `<Button>` JSX that fired `DELETE /api/part-compatibility/<id>`
 * with NO confirmation at all — one stray click unlinked a part. Both are
 * gone: the verb reaches the row menu and the trailing face, and the confirm
 * is a real stage-overlay plane (`PartCompatibilityRemovePlane`).
 *
 * Callers: CompatibilityManagementTab → usePartCompatibilitySpreadsheet.rowActions.
 */

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
