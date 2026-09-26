/** Scan-station skin application — the runtime half. */

import {
  DEFAULT_STATION_SKIN,
  STATION_SKIN_NAMES,
  isStationSkinName,
  resolveStationSkin,
  type StationSkinName,
} from '@/design-system/themes/station-skins';

const STATION_SKIN_STORAGE_KEY = 'ds-station-skin';

export function applyStationSkin(skin: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const resolved = resolveStationSkin(skin);

  if (resolved.name === DEFAULT_STATION_SKIN) {
    el.removeAttribute('data-station-skin');
  } else {
    el.setAttribute('data-station-skin', resolved.name);
  }

  try {
    if (resolved.name === DEFAULT_STATION_SKIN) {
      localStorage.removeItem(STATION_SKIN_STORAGE_KEY);
    } else {
      localStorage.setItem(STATION_SKIN_STORAGE_KEY, resolved.name);
    }
  } catch {
    /* private mode / storage disabled — attribute is still applied */
  }
}

export { isStationSkinName, STATION_SKIN_NAMES, type StationSkinName };

export const STATION_SKIN_BOOT_SCRIPT =
  `try{var s=localStorage.getItem('${STATION_SKIN_STORAGE_KEY}');` +
  `if(s&&s!=='${DEFAULT_STATION_SKIN}'&&${JSON.stringify(STATION_SKIN_NAMES)}.indexOf(s)>-1){` +
  `document.documentElement.setAttribute('data-station-skin',s);}}catch(e){}`;
