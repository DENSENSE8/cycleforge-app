'use client';

/**
 * Pick the ONE named print station a phone's jobs go to — every computer signed
 * in as this staffer that answered the status poll, by the name its operator
 * gave it (Settings → Hardware), with its readiness. The pick is remembered per
 * staffer on this device by `useStaffPrintBridgeClient`.
 *
 * Callers: `/m/print` (MobilePrintWorkspace), `/m/rs/[id]/paperwork`
 * (RepairStationCard).
 */

import { Button } from '@/design-system/primitives';
import { FilterDropdownSelect } from '@/design-system/components/FilterDropdownSelect';
import {
  formatStationLastSeen,
  isStaffPrintStationLive,
  roleReady,
  type StaffPrintStation,
} from '@/lib/print/staff-print-bridge';

/** "label + paper ready" · "paper ready" · "no printer ready" · "offline". */
function stationReadiness(station: StaffPrintStation, now: number): string {
  if (!isStaffPrintStationLive(station, now)) return 'offline';
  const ready = (['label', 'paper'] as const).filter((role) => roleReady(station.status, role));
  return ready.length ? `${ready.join(' + ')} ready` : 'no printer ready';
}

export function StaffPrintStationPicker({
  stations,
  target,
  now,
  staffName,
  onPick,
  onRefresh,
}: {
  stations: readonly StaffPrintStation[];
  target: StaffPrintStation | null;
  now: number;
  staffName: string;
  onPick: (stationId: string | null) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-2" data-testid="print-station-picker">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <FilterDropdownSelect
            label="Print station"
            value={target?.status.stationId ?? ''}
            onChange={(id) => onPick(id || null)}
            emptyOption={{
              value: '',
              label: stations.length ? 'Pick a station' : 'No station answering yet',
            }}
            options={stations.map((station) => ({
              value: station.status.stationId,
              label: `${station.status.stationName} — ${stationReadiness(station, now)}`,
            }))}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      {target ? (
        <p className="text-role-caption text-text-soft">
          {target.status.stationName} · heard {formatStationLastSeen(target.lastSeenAt, now)}
        </p>
      ) : (
        <p className="text-role-caption text-text-soft">
          {stations.length
            ? 'Pick which computer prints.'
            : `Open the desk app signed in as ${staffName} on the computer with the printer, and name it in Settings → Hardware.`}
        </p>
      )}
    </div>
  );
}
