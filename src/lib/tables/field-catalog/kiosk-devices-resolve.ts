/** Kiosk-devices slot resolvers — pure; dates resolve to the absolute instant. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import {
  formatDwellFace,
  hardwareStatusLabel,
} from '@/lib/kiosk/kiosk-device-derived';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';

function str(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function resolveKioskDevicesSlotValue(
  row: KioskDeviceTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'kiosk-devices.id':
      return { kind: 'value', text: str(row.id) };
    case 'kiosk-devices.label':
      return { kind: 'value', text: str(row.label) };
    case 'kiosk-devices.status':
      return { kind: 'value', text: str(row.status) };
    case 'kiosk-devices.terminal':
      return { kind: 'value', text: str(row.squareTerminalDeviceId) };
    case 'kiosk-devices.last_seen':
      return { kind: 'value', text: str(row.lastSeenAt) };
    case 'kiosk-devices.enrolled':
      return { kind: 'value', text: str(row.createdAt) };
    case 'kiosk-devices.enrolled_by': {
      const name = String(row.enrolledByName ?? '').trim() || null;
      // Person face: name from staff join; never invent a numeric id label.
      if (!name && row.enrolledByStaffId == null) {
        return { kind: 'person', staffId: null, name: null };
      }
      return {
        kind: 'person',
        staffId: row.enrolledByStaffId,
        name,
      };
    }
    case 'kiosk-devices.dwell':
      return { kind: 'value', text: formatDwellFace(row.dwellSeconds) };
    case 'kiosk-devices.hardware':
      return { kind: 'value', text: hardwareStatusLabel(row.hardwareStatus) };
    default:
      return null;
  }
}
