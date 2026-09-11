/**
 * `KioskDeviceTableRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * DATES chrome (Hash + CalendarClock) is two lines by engine law:
 *   · Hash (start) — last seen, or enrolled when never seen
 *   · Calendar (secondary) — dwell face via CompoundDelay.faceLabel
 * Never jam dwell into the Hash tip while leaving the Calendar line `--`.
 *
 * Callers: useKioskDevicesSpreadsheet → DataTable.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { formatDwellFace } from '@/lib/kiosk/kiosk-device-derived';
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

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'MMM d');
}

function dateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'yyyy-MM-dd');
}

export function kioskDeviceCompoundView(row: KioskDeviceTableRow): CompoundRowView {
  const terminal = String(row.squareTerminalDeviceId ?? '').trim();
  const seen = civilFace(row.lastSeenAt);
  const enrolled = civilFace(row.createdAt);
  const seenKey = dateKey(row.lastSeenAt);
  const enrolledKey = dateKey(row.createdAt);
  const dwell = formatDwellFace(row.dwellSeconds);
  const dwellStale =
    row.hardwareStatus === 'stale' ||
    row.hardwareStatus === 'offline' ||
    row.hardwareStatus === 'no_reader';

  // Hash line = start / heartbeat. One civil stamp on the face; enrolled rides
  // the tip when last-seen already owns the line.
  const startFace = seen ?? enrolled;
  const startKey = seenKey ?? enrolledKey;
  const startTip = [
    seen ? `Last seen ${seen}` : null,
    enrolled ? `Enrolled ${enrolled}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    id: String(row.id),
    thumbUrl: null,
    title: String(row.label ?? '').trim() || `Device #${row.id}`,
    note: terminal ? 'Card reader paired' : 'Cash / payment link only',
    orderId: String(row.id),
    tracking: null,
    platformValue: null,
    carrier: null,
    orderedAt: startFace
      ? {
          label: startFace,
          ...(startTip ? { tip: startTip } : null),
          dateKey: startKey,
        }
      : null,
    // Explicit Hash hover SoT — family names the chip; engine must not prefix
    // "Order date" / "Start date" when the tip already leads with Last seen.
    ...(startTip ? { startedHover: startTip } : null),
    stateLabel: STATUS_LABEL[row.status] ?? row.status,
    stateTone: STATUS_TONE[row.status] ?? 'neutral',
    // Calendar line = dwell (secondary temporal), not a warehouse ship-by.
    // faceLabel paints the magnitude on the empty second line instead of `--`.
    delay: dwell
      ? {
          days: 0,
          overdue: dwellStale && (row.dwellSeconds ?? 0) > 15 * 60,
          faceLabel: dwell,
        }
      : null,
    delayTip: dwell ? `Dwell · ${dwell}` : undefined,
    amount: null,
  };
}
