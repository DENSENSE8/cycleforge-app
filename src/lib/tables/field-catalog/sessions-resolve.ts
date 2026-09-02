/**
 * Sessions slot resolvers — staff-day row → bound slot cells.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { SessionDayRow } from '@/lib/sessions/session-day-report';
import {
  formatActiveDuration,
  SESSION_DAY_STATUS_LABEL,
} from '@/lib/sessions/session-day-fold';
import { sessionStationLabel } from '@/lib/sessions/session-page-nav';

export function resolveSessionsSlotValue(
  row: SessionDayRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'sessions.staff':
      return { kind: 'value', text: row.staffName || null };
    case 'sessions.status':
      return { kind: 'value', text: SESSION_DAY_STATUS_LABEL[row.status] };
    case 'sessions.duration':
      return { kind: 'value', text: formatActiveDuration(row.activeMs) };
    case 'sessions.station':
      return {
        kind: 'value',
        text: sessionStationLabel(row.lastSurfaceKey, row.lastScanType),
      };
    case 'sessions.blocks':
      return { kind: 'value', text: row.sessionCount > 0 ? String(row.sessionCount) : null };
    default:
      return null;
  }
}

export function sessionsSlotValuesFor(
  row: SessionDayRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveSessionsSlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
