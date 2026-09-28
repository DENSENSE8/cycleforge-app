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

export const PRINT_STATIONS_QUERY_KEY = ['v1', 'print-stations'] as const;

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || payload?.data === undefined) {
    throw new Error(payload?.error?.message ?? `Print station request failed (${response.status}).`);
  }
  return payload.data;
}

export async function fetchPrintStations(): Promise<PrintStationRegistry> {
  return readData(await fetch('/api/v1/print-stations', { credentials: 'same-origin', cache: 'no-store' }));
}

export async function sendPrintStationHeartbeat(heartbeat: PrintStationHeartbeat): Promise<void> {
  await readData(
    await fetch('/api/v1/print-stations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(heartbeat),
    }),
  );
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
