'use client';

/** Pick the print station a job goes to (phone /m surfaces and the desktop chat print card). */

import { Check, Printer } from '@/components/Icons';
import { isStaffPrintStationLive, roleReady } from '@/lib/print/staff-print-bridge';
import type { StaffPrintRole, StaffPrintStation } from '@/lib/print/staff-print-bridge';
import { cn } from '@/utils/_cn';

type PrintStationState = 'Ready' | 'Offline' | 'Not set up';

/** One word for a station, for the printer the job needs (any printer when no role). */
export function printStationState(station: StaffPrintStation, role: StaffPrintRole | null, now: number): PrintStationState {
  if (!isStaffPrintStationLive(station, now)) return 'Offline';
  const ready = role ? roleReady(station.status, role) : roleReady(station.status, 'label') || roleReady(station.status, 'paper');
  return ready ? 'Ready' : 'Not set up';
}

export function StaffPrintStationPicker({
  stations,
  target,
  now,
  role,
  onPick,
}: {
  stations: readonly StaffPrintStation[];
  target: StaffPrintStation | null;
  now: number;
  /** The printer this screen prints on — decides each row's status word; omit when it prints on both. */
  role?: StaffPrintRole;
  onPick: (stationId: string | null) => void;
}) {
  if (stations.length === 0) {
    return (
      <p className="px-mode-page py-3 text-role-caption text-mode-muted" data-testid="print-station-picker">
        No printer online. Keep CycleForge open on the computer with the printer.
      </p>
    );
  }
  return (
    // Flat radio rows (operator 2026-09-25): full-bleed, one rule under each,
    // the chosen printer marked by an ink bar on the leading edge — no box.
    <div role="radiogroup" aria-label="Printer" className="flex flex-col bg-mode-panel" data-testid="print-station-picker">
      {stations.map((station) => {
        const selected = station.status.stationId === target?.status.stationId;
        const state = printStationState(station, role ?? null, now);
        return (
          // ds-raw-button: full-width radio row (icon · name · status), not an action button
          <button
            key={station.status.stationId}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onPick(station.status.stationId)}
            className="group relative flex min-h-mode-hit-cta items-center gap-3 border-b border-mode-rule bg-mode-panel px-mode-page text-left last:border-b-0 active:bg-mode-ink"
          >
            {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-mode-ink" /> : null}
            <Printer className="h-5 w-5 shrink-0 text-mode-muted group-active:text-mode-panel" />
            <span className="min-w-0 flex-1 truncate text-mode-body font-semibold text-mode-ink group-active:text-mode-panel">
              {station.status.stationName}
            </span>
            <span
              className={cn(
                'shrink-0 text-role-caption font-semibold group-active:text-mode-panel',
                state === 'Ready' ? 'text-text-success' : 'text-mode-muted',
              )}
            >
              {state}
            </span>
            {selected ? <Check className="h-4 w-4 shrink-0 text-mode-ink group-active:text-mode-panel" /> : null}
          </button>
        );
      })}
    </div>
  );
}
