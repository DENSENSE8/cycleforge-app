/** Scan-station depth application — the runtime half. */

import {
  DEFAULT_STATION_DEPTH,
  STATION_DEPTH_NAMES,
  isStationDepthName,
  resolveStationDepth,
  type StationDepthName,
} from '@/design-system/themes/station-depths';

export const STATION_DEPTH_STORAGE_KEY = 'ds-station-depth';

export function applyStationDepth(depth: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const resolved = resolveStationDepth(depth);

  if (resolved.name === DEFAULT_STATION_DEPTH) {
    el.removeAttribute('data-station-depth');
  } else {
    el.setAttribute('data-station-depth', resolved.name);
  }

  try {
    if (resolved.name === DEFAULT_STATION_DEPTH) {
      localStorage.removeItem(STATION_DEPTH_STORAGE_KEY);
    } else {
      localStorage.setItem(STATION_DEPTH_STORAGE_KEY, resolved.name);
    }
  } catch {
    /* private mode / storage disabled — attribute is still applied */
  }
}

export { isStationDepthName, STATION_DEPTH_NAMES, type StationDepthName };

export const STATION_DEPTH_BOOT_SCRIPT =
  `try{var d=localStorage.getItem('${STATION_DEPTH_STORAGE_KEY}');` +
  `if(d&&d!=='${DEFAULT_STATION_DEPTH}'&&${JSON.stringify(STATION_DEPTH_NAMES)}.indexOf(d)>-1){` +
  `document.documentElement.setAttribute('data-station-depth',d);}}catch(e){}`;
