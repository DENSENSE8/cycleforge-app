/** Unfound-queue slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { QueueRow } from '@/components/receiving/unfound/queue-table/unfound-queue-shared';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** The row's stable handle — the same key the list renders by. */
export function unfoundItemHandle(row: QueueRow): string {
  return `${row.kind}:${row.source_id}`;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveUnfoundSlotValue(
  row: QueueRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'unfound.item':
      return { kind: 'value', text: unfoundItemHandle(row) };
    case 'unfound.ticket':
      return { kind: 'value', text: str(row.zendesk_ticket_id) };
    case 'unfound.usa_note':
      return { kind: 'value', text: str(row.usa_team_note) };
    case 'unfound.vietnam_note':
      return { kind: 'value', text: str(row.vietnam_team_note) };
    case 'unfound.checked':
      // Unchecked is the ordinary state of a queue nobody has worked yet, and
      // it says nothing — blank rather than "No", so the column carries signal.
      return { kind: 'value', text: row.checked ? 'Checked' : null };
    case 'unfound.created': {
      const raw = str(row.created_at);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    default:
      return null;
  }
}
