/**
 * Staff-day row → CompoundRowView. Duration rides the note, never amount.
 */

import type { CompoundRowView, CompoundStateTone } from '@/components/tables/compound/compound-row-model';
import {
  SESSION_DAY_STATUS_LABEL,
  sessionDayNoteLine,
} from '@/lib/sessions/session-day-fold';
import type { SessionDayRow } from '@/lib/sessions/session-day-report';
import { sessionStationLabel } from '@/lib/sessions/session-page-nav';

function statusTone(status: SessionDayRow['status']): CompoundStateTone {
  if (status === 'armed') return 'alert';
  if (status === 'ended') return 'done';
  return 'neutral';
}

export function sessionDayCompoundView(row: SessionDayRow): CompoundRowView {
  const stationLabels = [
    ...new Set(
      row.scanTypes
        .map((t) => sessionStationLabel(null, t))
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  if (stationLabels.length === 0) {
    const last = sessionStationLabel(row.lastSurfaceKey, row.lastScanType);
    if (last) stationLabels.push(last);
  }

  return {
    id: String(row.staffId),
    thumbUrl: null,
    title: row.staffName,
    note: sessionDayNoteLine(row.activeMs, stationLabels),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: SESSION_DAY_STATUS_LABEL[row.status],
    stateTone: statusTone(row.status),
    stateTip:
      row.status === 'armed'
        ? 'Armed at a bench'
        : row.status === 'parked'
          ? 'Parked — not counting'
          : row.status === 'open'
            ? 'Open, not armed'
            : 'Ended for this day',
    amount: null,
    delay: null,
  };
}
