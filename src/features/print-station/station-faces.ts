/**
 * How a print station reads on the Stations mode — its state badge, handle,
 * printers, org defaults and last-heard line. Shared by the list row and the
 * open station's record (`PrintStationsDesk`, `PrintStationRecord`).
 */

import type { RecordStateFace } from '@/design-system/tokens/record';
import type { PrintStationEntry } from '@/hooks/usePrintStations';
import type { PrintStock } from '@/lib/label-prints/print-route';
import type { PrintStationAssignment } from '@/lib/print/print-station-registry-contracts';
import { UNNAMED_PRINT_STATION } from '@/lib/print/staff-print-bridge';
import { formatRelativeTime } from '@/lib/search/search-recents';

export const STOCKS: readonly PrintStock[] = ['label', 'paper'];

/** The stock's word, as the Labels & docs rail card says it. */
export const STOCK_TERM: Readonly<Record<PrintStock, string>> = { label: 'Labels', paper: 'Paperwork' };

/** The open station's body on the triage stage canvas. */
export const STATION_RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink';

/** Paused from Stations · heard now and can print · heard now, nothing to print on · not heard inside the live window. */
const STATION_STATE = {
  paused: { id: 'paused', code: 'PSD', label: 'Paused', tone: 'warning', icon: 'circle-pause' },
  online: { id: 'online', code: 'ON', label: 'Online', tone: 'success', icon: 'check' },
  noPrinter: { id: 'no-printer', code: 'NP', label: 'No printer', tone: 'warning', icon: 'circle-dot' },
  offline: { id: 'offline', code: 'OFF', label: 'Offline', tone: 'neutral', icon: 'circle-pause' },
} as const satisfies Readonly<Record<string, RecordStateFace>>;

export function stationState(station: PrintStationEntry): RecordStateFace {
  if (station.paused) return STATION_STATE.paused;
  if (!station.live) return STATION_STATE.offline;
  return station.label.ready || station.paper.ready ? STATION_STATE.online : STATION_STATE.noPrinter;
}

/** What kind of station it is, in the operator's words. */
export function stationKindLabel(station: PrintStationEntry): string {
  return station.kind === 'enrolled' ? 'Enrolled — an org computer, no sign-in' : 'Browser — a signed-in staff computer';
}

/** The station's handle: its name; unnamed computers are told apart by the tail of their id. */
export function stationHandle(station: PrintStationEntry): string {
  return station.stationName === UNNAMED_PRINT_STATION && !station.thisComputer
    ? `${station.stationName} ·${station.stationId.slice(-4)}`
    : station.stationName;
}

/** What one stock prints on: the printer's name, else whether it is ready at all. */
export function printerFace(station: PrintStationEntry, stock: PrintStock): string | null {
  return station[stock].printer ?? (station[stock].ready ? (station.thisComputer ? 'This browser' : 'Ready') : null);
}

/** "Label: ZD420 · Paper: HP M404" — what it prints on, or that it cannot. */
export function printersLine(station: PrintStationEntry): string {
  const parts = STOCKS.flatMap((stock) => {
    const printer = printerFace(station, stock);
    return printer ? [`${stock === 'label' ? 'Label' : 'Paper'}: ${printer}`] : [];
  });
  return parts.length ? parts.join(' · ') : 'No printer set up';
}

/** The stocks this station prints for the whole org. */
export function defaultsOf(station: PrintStationEntry, assignment: PrintStationAssignment): PrintStock[] {
  return STOCKS.filter((stock) => assignment[stock] === station.stationId);
}

export function seenLine(station: PrintStationEntry): string {
  if (station.thisComputer || station.live) return 'Now';
  return station.lastSeenAt ? `Seen ${formatRelativeTime(new Date(station.lastSeenAt).toISOString())} ago` : 'Never heard';
}

/** "Last job 5m ago" — when it last logged a print; null when it never has. */
export function lastJobLine(station: PrintStationEntry): string | null {
  return station.lastJobAt ? `Last job ${formatRelativeTime(new Date(station.lastJobAt).toISOString())} ago` : null;
}
