/** Gate preamble (Fact-Forcing): */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { formatDwellFace } from '@/lib/kiosk/kiosk-device-derived';
import type { KioskSlotEventTableRow } from '@/lib/kiosk/kiosk-slot-event-row';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function transitionText(prev: string | null, next: string | null): string | null {
  const a = str(prev);
  const b = str(next);
  if (a && b) return `${a} → ${b}`;
  return b ?? a;
}

function dwellFace(dwellMs: number | null): string | null {
  if (dwellMs == null || dwellMs < 0) return null;
  return formatDwellFace(Math.floor(dwellMs / 1000));
}

export function resolveKioskSlotEventsSlotValue(
  row: KioskSlotEventTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'kiosk-slot-events.device': {
      const label = str(row.deviceLabel);
      const id = row.kioskDeviceId;
      if (label) return { kind: 'value', text: label };
      return { kind: 'value', text: id ? String(id) : null };
    }
    case 'kiosk-slot-events.occurred':
      return { kind: 'value', text: str(row.occurredAt) };
    case 'kiosk-slot-events.slot':
      return { kind: 'value', text: str(row.slotKey) };
    case 'kiosk-slot-events.status_change':
      return { kind: 'value', text: transitionText(row.fromState, row.toState) };
    case 'kiosk-slot-events.dwell':
      return { kind: 'value', text: dwellFace(row.dwellMs) };
    case 'kiosk-slot-events.hardware':
      return { kind: 'value', text: str(row.hardwareStatus) };
    default:
      return null;
  }
}
