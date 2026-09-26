/** Tracking-exception slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import {
  trackingExceptionCarrier,
  type TrackingExceptionRow,
} from '@/components/tracking-exceptions/types';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function dayText(iso: string | null | undefined): string | null {
  const raw = str(iso);
  return raw ? formatDateKeyShort(raw.slice(0, 10)) : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveTrackingExceptionSlotValue(
  row: TrackingExceptionRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'tracking-exceptions.tracking':
      return { kind: 'value', text: str(row.tracking_number) };
    case 'tracking-exceptions.carrier':
      return { kind: 'value', text: str(trackingExceptionCarrier(row)) };
    case 'tracking-exceptions.reason':
      return { kind: 'value', text: str(row.exception_reason) };
    case 'tracking-exceptions.status':
      return { kind: 'value', text: str(row.status) };
    case 'tracking-exceptions.created':
      return { kind: 'value', text: dayText(row.created_at) };
    case 'tracking-exceptions.source':
      return { kind: 'value', text: str(row.source_station) };
    case 'tracking-exceptions.staff':
      return {
        kind: 'person',
        staffId: row.staff_id,
        name: str(row.staff_display_name) ?? str(row.staff_name),
      };
    case 'tracking-exceptions.retries':
      // Never retried is the ordinary state and says nothing — blank rather
      // than a 0, so the column carries signal about the STUCK rows.
      return { kind: 'value', text: row.zoho_check_count > 0 ? String(row.zoho_check_count) : null };
    case 'tracking-exceptions.last_check':
      return { kind: 'value', text: dayText(row.last_zoho_check_at) };
    case 'tracking-exceptions.notes':
      return { kind: 'value', text: str(row.notes) };
    default:
      return null;
  }
}
