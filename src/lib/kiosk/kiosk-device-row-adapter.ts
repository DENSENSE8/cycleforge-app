/**
 * `KioskDeviceTableRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * The retired display kept the pairing status as a coloured chip built from two
 * hand-written lookup maps. Here it is the state pill's LABEL and TONE, which is
 * the shared vocabulary every other table already speaks.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';

const STATUS_LABEL: Record<KioskDeviceTableRow['status'], string> = {
  active: 'Paired',
  enrolled: 'Awaiting pairing',
  revoked: 'Revoked',
};

/**
 * A revoked tablet is the one an admin is looking for; a paired one is done.
 * Awaiting-pairing is ordinary progress and stays neutral — the enrolment flow
 * is expected to sit there until somebody walks to the tablet.
 */
const STATUS_TONE: Record<KioskDeviceTableRow['status'], CompoundStateTone> = {
  active: 'done',
  enrolled: 'neutral',
  revoked: 'alert',
};

export function kioskDeviceCompoundView(row: KioskDeviceTableRow): CompoundRowView {
  const terminal = String(row.squareTerminalDeviceId ?? '').trim();
  return {
    id: String(row.id),
    thumbUrl: null,
    title: String(row.label ?? '').trim() || `Device #${row.id}`,
    // What this lane can take money with — the fact an operator asks about.
    note: terminal ? 'Card reader paired' : 'Cash / payment link only',
    orderId: String(row.id),
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: STATUS_LABEL[row.status] ?? row.status,
    stateTone: STATUS_TONE[row.status] ?? 'neutral',
    delay: null,
    amount: null,
  };
}
