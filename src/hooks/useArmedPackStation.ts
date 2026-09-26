'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  PACK_STATION_PARAM,
  isAutoArmSuppressed,
  parsePackStationParam,
  readArmedPackStation,
  resolveWorkstationBench,
  writeArmedPackStation,
  type ArmedPackStation,
} from '@/lib/packing/pack-station-arm';
import { packPlacementQuery } from '@/lib/queries/pack-placement-queries';
import { getWorkstation } from '@/lib/settings/workstation';

let armListeners = new Set<() => void>();
function emitArm() {
  for (const l of armListeners) l();
}

function subscribeArm(cb: () => void) {
  armListeners.add(cb);
  const onCustom = () => cb();
  if (typeof window !== 'undefined') {
    window.addEventListener('cf-pack-station-armed', onCustom);
  }
  return () => {
    armListeners.delete(cb);
    if (typeof window !== 'undefined') {
      window.removeEventListener('cf-pack-station-armed', onCustom);
    }
  };
}

function getArmSnapshot(): ArmedPackStation | null {
  return readArmedPackStation();
}

/** Armed packing DESK/STAGING for Ready-to-Pack tracking scans. */
export function useArmedPackStation() {
  const armed = useSyncExternalStore(subscribeArm, getArmSnapshot, () => null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlStationId = parsePackStationParam(searchParams.get(PACK_STATION_PARAM));

  const arm = useCallback(
    (station: ArmedPackStation | null, opts?: { syncUrl?: boolean }) => {
      writeArmedPackStation(station);
      emitArm();
      if (opts?.syncUrl === false) return;
      const params = new URLSearchParams(searchParams.toString());
      if (station) {
        params.set(PACK_STATION_PARAM, String(station.locationId));
      } else {
        params.delete(PACK_STATION_PARAM);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // URL → arm when a KPI filter lands a station id we already know from storage
  // or when storage is empty (name filled later by strip).
  useEffect(() => {
    if (urlStationId == null) return;
    const current = readArmedPackStation();
    if (current?.locationId === urlStationId) return;
    if (current && current.locationId !== urlStationId) {
      // Keep URL as filter; don't clobber a different armed bench unless names match.
      return;
    }
  }, [urlStationId]);

  const [mounted, setMounted] = useState(false);
  const [boundBenchId, setBoundBenchId] = useState<number | null>(null);
  useEffect(() => {
    setMounted(true);
    // Read the device binding once — it is localStorage, not render state.
    setBoundBenchId(getWorkstation().packBenchLocationId);
  }, []);

  // ── Workstation bench auto-arm (Phase 1.5) ───────────────────────────────── Only ask for the bench list when there is something to seed,…
  const wantsAutoArm = mounted && armed == null && boundBenchId != null;
  const benchQuery = useQuery({ ...packPlacementQuery(), enabled: wantsAutoArm });
  const benchLocations = benchQuery.data?.locations;

  useEffect(() => {
    if (!wantsAutoArm) return;
    // An explicit clear outranks the binding for the rest of the session —
    // re-arming what the operator just put down is fighting them.
    if (isAutoArmSuppressed()) return;
    const bench = resolveWorkstationBench(benchLocations, boundBenchId);
    if (!bench) return;
    // Arm the PLACE TARGET only. Writing `?packStation=` here would filter the
    // board to one bench on load without the operator asking — arming is a
    // scan-destination, the URL param is a filter, and they are not the same act.
    arm(bench, { syncUrl: false });
  }, [wantsAutoArm, benchLocations, boundBenchId, arm]);

  return {
    armed: mounted ? armed : null,
    urlStationId,
    arm,
    clear: () => arm(null),
  };
}
