/**
 * Browser transport for the org print-station registry
 * (`/api/v1/print-stations`). Same-origin, session cookie only.
 */
import type { PrintStock } from '@/lib/label-prints/print-route';
import type {
  PrintStationAssignment,
  PrintStationHeartbeat,
  PrintStationRegistry,
} from './print-station-registry-contracts';

import { PRINT_STATION_NAME_MAX, readPrintStation, setPrintStationName } from './print-station';
import { UNNAMED_PRINT_STATION } from './staff-print-bridge';

export const PRINT_STATIONS_QUERY_KEY = ['v1', 'print-stations'] as const;

/** A refused registry request, with its HTTP status (404 = the station never checked in). */
export class PrintStationRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PrintStationRequestError';
    this.status = status;
  }
}

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || payload?.data === undefined) {
    throw new PrintStationRequestError(payload?.error?.message ?? `Print station request failed (${response.status}).`, response.status);
  }
  return payload.data;
}

export async function fetchPrintStations(): Promise<PrintStationRegistry> {
  return readData(await fetch('/api/v1/print-stations', { credentials: 'same-origin', cache: 'no-store' }));
}

/** One beat; answers with the name the ORG registry holds for this station (the registry owns names). */
export async function sendPrintStationHeartbeat(heartbeat: PrintStationHeartbeat): Promise<{ name: string }> {
  return readData(
    await fetch('/api/v1/print-stations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(heartbeat),
    }),
  );
}

/** Rename any station for the whole org; resolves the name the registry now holds. */
export async function putPrintStationName(stationId: string, name: string): Promise<{ name: string }> {
  return readData(
    await fetch('/api/v1/print-stations/name', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stationId, name: name.trim().slice(0, PRINT_STATION_NAME_MAX) }),
    }),
  );
}

/**
 * Rename THIS computer: the org registry first (it owns the name), then the
 * computer's own copy, so its bridge status and next heartbeat agree. A
 * computer that has never checked in (not a print station yet) keeps the name
 * locally; its first heartbeat carries it to the registry.
 */
export async function renameThisPrintStation(name: string): Promise<string> {
  const { id } = readPrintStation();
  let saved = name.trim().slice(0, PRINT_STATION_NAME_MAX);
  try {
    if (id) saved = (await putPrintStationName(id, saved)).name;
  } catch (error) {
    if (!(error instanceof PrintStationRequestError && error.status === 404)) throw error;
  }
  setPrintStationName(saved === UNNAMED_PRINT_STATION ? '' : saved);
  return saved || UNNAMED_PRINT_STATION;
}

export async function putPrintStationAssignment(stock: PrintStock, stationId: string | null): Promise<PrintStationAssignment> {
  return readData(
    await fetch('/api/v1/print-stations/assignment', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stock, stationId }),
    }),
  );
}
