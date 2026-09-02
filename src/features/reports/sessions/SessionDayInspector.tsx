'use client';

/**
 * Right rail: one staffer's intervals for the warehouse day.
 */

import { useMemo } from 'react';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { useRegisterRightPanel } from '@/components/right-rail/useRegisterRightPanel';
import { RIGHT_RAIL_PRIORITY } from '@/lib/right-rail/store';
import type { SessionDayIntervalRow, SessionDayRow } from '@/lib/sessions/session-day-report';
import { sessionStationLabel } from '@/lib/sessions/session-page-nav';
import { formatDateTimePST } from '@/utils/date';

const RAIL_ID = 'detail:session-day';

function IntervalsLeaf({
  intervals,
}: {
  intervals: readonly SessionDayIntervalRow[];
}) {
  if (intervals.length === 0) {
    return (
      <p className="px-3 py-4 text-role-body text-text-muted">No intervals on this day.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 px-3 py-3" data-testid="session-day-intervals">
      {intervals.map((row) => {
        const station = sessionStationLabel(row.surfaceKey, row.scanType);
        const kind = row.kind === 'active' ? 'Active' : 'Parked';
        const ended = row.endedAt ? formatDateTimePST(row.endedAt) : 'now';
        return (
          <li key={row.id} className="text-role-body">
            <span className="font-medium text-text-default">{kind}</span>
            {station ? <span className="text-text-muted"> · {station}</span> : null}
            <div className="text-text-muted">
              {formatDateTimePST(row.startedAt)} → {ended}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function InspectorBody({
  row,
  intervals,
}: {
  row: SessionDayRow;
  intervals: readonly SessionDayIntervalRow[];
}) {
  const leaves = useMemo(
    () => [
      {
        id: DESK_INSPECTOR_INDEX,
        label: 'Intervals',
        content: <IntervalsLeaf intervals={intervals} />,
      },
    ],
    [intervals],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="session-day-inspector">
      <DeskInspectorIndexShell
        stance="index"
        key={row.staffId}
        leaves={leaves}
        defaultActiveId={DESK_INSPECTOR_INDEX}
        indexFilter={false}
        ariaLabel={`${row.staffName} session intervals`}
        testId="session-day-inspector-index"
        backLabel="Back"
      />
    </div>
  );
}

export function SessionDayInspector({
  row,
  intervals,
  onClose,
}: {
  row: SessionDayRow | null;
  intervals: readonly SessionDayIntervalRow[];
  onClose: () => void;
}) {
  useRegisterRightPanel({
    id: RAIL_ID,
    priority: RIGHT_RAIL_PRIORITY.detail,
    enabled: row != null,
    modal: false,
    ariaLabel: 'Session day details',
    onClose,
    node: row ? <InspectorBody row={row} intervals={intervals} /> : null,
  });
  return null;
}
