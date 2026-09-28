/**
 * This computer's print-station identity — a stable per-browser id plus the human name the operator gave it.
 * `targetStationId` (operator 2026-09-24: "pick one named print station").
 */

import { UNNAMED_PRINT_STATION, type StaffPrintRole } from './staff-print-bridge';

const ID_KEY = 'cf.printStation.id';
const NAME_KEY = 'cf.printStation.name';

/** Dispatched on the window when this computer's station id or name changes. */
export const PRINT_STATION_CHANGED_EVENT = 'cf:print-station-changed';

interface PrintStation {
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

/** This browser's localStorage for the pick, or null (server render, storage blocked). */
export function printStationPickStorage(): PrintStationPickStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * One key per org + staffer: a shared phone handed to another staffer never
 * sends their paper to the previous staffer's station. A `stock` keys the
 * Labels & docs desk's pick per stock (labels to one station, paper to another).
 */
function rememberedPrintStationKey(orgId: string, staffId: number, stock?: StaffPrintRole): string | null {
  if (!orgId.trim() || !Number.isInteger(staffId) || staffId <= 0) return null;
  return `cf.printStation.pick:${orgId}:${staffId}${stock ? `:${stock}` : ''}`;
}

/** The station this staffer last picked on this device (for `stock`, when given), or null. */
export function readRememberedPrintStationId(
  storage: PrintStationPickStorage | null,
  orgId: string,
  staffId: number,
  stock?: StaffPrintRole,
): string | null {
  const key = rememberedPrintStationKey(orgId, staffId, stock);
  if (!storage || !key) return null;
  try {
    return storage.getItem(key)?.trim() || null;
  } catch {
    return null;
  }
}

/** Remember (or with null / blank, forget) this staffer's pick on this device, per `stock` when given. */
export function rememberPrintStationId(
  storage: PrintStationPickStorage | null,
  orgId: string,
  staffId: number,
  stationId: string | null,
  stock?: StaffPrintRole,
): void {
  const key = rememberedPrintStationKey(orgId, staffId, stock);
  if (!storage || !key) return;
  const id = stationId?.trim() ?? '';
  try {
    if (id) storage.setItem(key, id);
    else storage.removeItem(key);
  } catch {
    /* private mode / quota — the pick just is not remembered */
  }
}

// ── One print per job, however many tabs share this station ────────────────

const CLAIMED_JOBS_KEY = 'cf.printStation.claimedJobs';
/** Recent job ids kept for the claim check — far more than can be in flight. */
const CLAIMED_JOBS_KEEP = 50;

/** Run `work` for one print job in exactly ONE tab of this browser. */
export async function runPrintJobOnce(requestId: string, work: () => Promise<void>): Promise<boolean> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) {
    await work();
    return true;
  }
  return locks.request(`cf-print-job:${requestId}`, { ifAvailable: true }, async (lock) => {
    if (!lock) return false;
    let claimed: string[] = [];
    try {
      claimed = JSON.parse(window.localStorage.getItem(CLAIMED_JOBS_KEY) ?? '[]') as string[];
      if (claimed.includes(requestId)) return false;
      window.localStorage.setItem(CLAIMED_JOBS_KEY, JSON.stringify([requestId, ...claimed].slice(0, CLAIMED_JOBS_KEEP)));
    } catch {
      /* storage unavailable — the lock alone still keeps concurrent tabs apart */
    }
    await work();
    return true;
  });
}
