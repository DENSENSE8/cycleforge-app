/**
 * Armed packing station for Ready-to-Pack batch place.
 * Session-scoped so a wedge session keeps the bench across trackings;
 * URL `?packStation=` filters the board and can arm from a KPI click.
 */

import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';

export const PACK_STATION_PARAM = 'packStation';
/** Filter to any order with a packing-station placement (To-ship / Ready to Pack). */
export const PACK_PLACED_PARAM = 'packPlaced';
const STORAGE_KEY = 'cf.pack-station-arm';
/**
 * Set once the operator explicitly clears the armed bench, so the Settings
 * workstation binding does not immediately re-arm what they just put down.
 * Session-scoped like the arm itself — a new session starts from the binding.
 */
const AUTO_ARM_OFF_KEY = 'cf.pack-station-arm.auto-off';

export interface ArmedPackStation {
  locationId: number;
  name: string;
  barcode: string | null;
  locationKind: 'DESK' | 'STAGING';
}

export function readArmedPackStation(): ArmedPackStation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ArmedPackStation>;
    const locationId = Number(parsed.locationId);
    if (!Number.isFinite(locationId) || locationId <= 0) return null;
    const kind = parsed.locationKind === 'STAGING' ? 'STAGING' : 'DESK';
    return {
      locationId,
      name: String(parsed.name || ''),
      barcode: parsed.barcode ?? null,
      locationKind: kind,
    };
  } catch {
    return null;
  }
}

export function writeArmedPackStation(station: ArmedPackStation | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!station) {
      sessionStorage.removeItem(STORAGE_KEY);
      // Clearing is an explicit act: stop the workstation binding from
      // re-arming this bench behind the operator for the rest of the session.
      sessionStorage.setItem(AUTO_ARM_OFF_KEY, '1');
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(station));
    sessionStorage.removeItem(AUTO_ARM_OFF_KEY);
  } catch {
    /* ignore quota */
  }
}

/** True once the operator cleared the bench by hand this session. */
export function isAutoArmSuppressed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(AUTO_ARM_OFF_KEY) === '1';
  } catch {
    return false;
  }
}

/** A bench the workstation binding can point at (shape of the API's `locations`). */
interface PackBenchOption {
  id: number;
  name: string;
  /** Operator nickname (`locations.display_name`); null = read {@link name}. */
  displayName?: string | null;
  barcode: string | null;
  locationKind: string;
}

/** Resolve the Settings workstation bench binding against the live bench list. */
export function resolveWorkstationBench(
  locations: readonly PackBenchOption[] | undefined | null,
  packBenchLocationId: number | null | undefined,
): ArmedPackStation | null {
  const wanted = Number(packBenchLocationId);
  if (!Number.isFinite(wanted) || wanted <= 0) return null;
  const match = (locations ?? []).find((loc) => Number(loc.id) === wanted);
  if (!match) return null;
  return {
    locationId: Number(match.id),
    // The FACE, resolved once here — `armed.name` is a display string ("Placing
    // at …"), so a caller must not have to remember to re-resolve the nickname.
    name: packBenchShortLabel({
      locationName: String(match.name || ''),
      locationDisplayName: match.displayName,
      locationKind: match.locationKind,
    }),
    barcode: match.barcode ?? null,
    locationKind: match.locationKind === 'STAGING' ? 'STAGING' : 'DESK',
  };
}

export function parsePackStationParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Looks like a packing-station barcode (PACK-DESK-*, PACK-STAGING, QA-PACK-*). */
export function looksLikePackStationBarcode(value: string): boolean {
  const v = String(value || '').trim().toUpperCase();
  return /^(QA-)?PACK-(DESK-\d+|STAGING|ROOM)$/.test(v);
}
