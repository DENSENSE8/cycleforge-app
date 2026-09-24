/**
 * This computer's print-station identity — a stable per-browser id plus the
 * human name the operator gave it. The staff print bridge stamps both on every
 * status message, and a job is only fulfilled by the host whose id matches its
 * `targetStationId` (operator 2026-09-24: "pick one named print station").
 *
 * Stored per-origin-per-device in localStorage, next to the silent-print flag
 * and printer profiles, so it is inherently per-workstation.
 */

import { UNNAMED_PRINT_STATION } from './staff-print-bridge';

const ID_KEY = 'cf.printStation.id';
const NAME_KEY = 'cf.printStation.name';

/** Dispatched on the window when this computer's station id or name changes. */
export const PRINT_STATION_CHANGED_EVENT = 'cf:print-station-changed';

export interface PrintStation {
  id: string;
  name: string;
}

/** Longest station name we keep; longer input is trimmed. */
export const PRINT_STATION_NAME_MAX = 40;

function newStationId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `ps_${c.randomUUID()}`;
  return `ps_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Read (and on first call, mint + store) this browser's station. Server render
 * and storage failures return an empty id, which parsers treat as junk — so a
 * computer that cannot remember its id never claims a job.
 */
export function readPrintStation(): PrintStation {
  if (typeof window === 'undefined') return { id: '', name: UNNAMED_PRINT_STATION };
  try {
    const storage = window.localStorage;
    let id = storage.getItem(ID_KEY)?.trim() ?? '';
    if (!id) {
      id = newStationId();
      storage.setItem(ID_KEY, id);
    }
    const name = storage.getItem(NAME_KEY)?.trim() || UNNAMED_PRINT_STATION;
    return { id, name };
  } catch {
    return { id: '', name: UNNAMED_PRINT_STATION };
  }
}

/** Rename this computer's station. An empty name clears it back to unnamed. */
export function setPrintStationName(raw: string): void {
  if (typeof window === 'undefined') return;
  const name = raw.trim().slice(0, PRINT_STATION_NAME_MAX);
  try {
    if (name) window.localStorage.setItem(NAME_KEY, name);
    else window.localStorage.removeItem(NAME_KEY);
    window.dispatchEvent(new CustomEvent(PRINT_STATION_CHANGED_EVENT, { detail: { name } }));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// ── The phone's pick, remembered per staff ─────────────────────────────────

/** The storage calls the remembered-pick helpers need (localStorage in the app). */
export type PrintStationPickStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * One key per org + staffer: a shared phone handed to another staffer never
 * sends their paper to the previous staffer's station.
 */
export function rememberedPrintStationKey(orgId: string, staffId: number): string | null {
  if (!orgId.trim() || !Number.isInteger(staffId) || staffId <= 0) return null;
  return `cf.printStation.pick:${orgId}:${staffId}`;
}

/** The station this staffer last picked on this device, or null. */
export function readRememberedPrintStationId(
  storage: PrintStationPickStorage | null,
  orgId: string,
  staffId: number,
): string | null {
  const key = rememberedPrintStationKey(orgId, staffId);
  if (!storage || !key) return null;
  try {
    return storage.getItem(key)?.trim() || null;
  } catch {
    return null;
  }
}

/** Remember (or with null / blank, forget) this staffer's pick on this device. */
export function rememberPrintStationId(
  storage: PrintStationPickStorage | null,
  orgId: string,
  staffId: number,
  stationId: string | null,
): void {
  const key = rememberedPrintStationKey(orgId, staffId);
  if (!storage || !key) return;
  const id = stationId?.trim() ?? '';
  try {
    if (id) storage.setItem(key, id);
    else storage.removeItem(key);
  } catch {
    /* private mode / quota — the pick just is not remembered */
  }
}
