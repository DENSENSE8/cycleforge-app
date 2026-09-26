/**
 * Workstation settings — identifies the physical station an operator is at.
 * Used to pre-fill receiving/packing forms and scope scans / filters.
 */

const KEY = 'cf.workstation';

export type WorkstationRole = '' | 'packer' | 'tech' | 'receiver' | 'admin';

export interface WorkstationSettings {
  stationName: string;
  defaultWarehouse: string;
  defaultRole: WorkstationRole;
  /** Packing bench this device sits at — a REFERENCE to a `locations` row (`location_kind` DESK/STAGING), never a bench record of its own and… */
  packBenchLocationId: number | null;
}

export const DEFAULT_WORKSTATION: WorkstationSettings = {
  stationName: '',
  defaultWarehouse: '',
  defaultRole: '',
  packBenchLocationId: null,
};

/**
 * A bench binding is a positive `locations.id` or nothing. A stored `0`, a
 * string, or a stale `null` all mean "no bench" — never a falsy id the arm
 * path would try to resolve.
 */
export function normalizePackBenchLocationId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getWorkstation(): WorkstationSettings {
  if (typeof window === 'undefined') return DEFAULT_WORKSTATION;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_WORKSTATION;
    const parsed = JSON.parse(raw) as Partial<WorkstationSettings>;
    return {
      stationName: String(parsed.stationName ?? ''),
      defaultWarehouse: String(parsed.defaultWarehouse ?? ''),
      defaultRole: (parsed.defaultRole ?? '') as WorkstationRole,
      packBenchLocationId: normalizePackBenchLocationId(parsed.packBenchLocationId),
    };
  } catch {
    return DEFAULT_WORKSTATION;
  }
}

export function setWorkstation(patch: Partial<WorkstationSettings>): WorkstationSettings {
  const next = { ...getWorkstation(), ...patch };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}
