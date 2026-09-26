'use client';

/** URL + session persistence for the station composer mode. */

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  STATION_COMPOSER_MODE_DEFAULT,
  STATION_COMPOSER_MODE_PARAM,
  cycleStationComposerMode,
  readStationComposerModeSession,
  resolveStationComposerMode,
  writeStationComposerModeSession,
  type StationComposerMode,
} from '@/lib/composer/station-composer-mode';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';

export function useStationComposerMode(): {
  mode: StationComposerMode;
  setMode: (next: StationComposerMode) => void;
  cycleMode: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlRaw = searchParams.get(STATION_COMPOSER_MODE_PARAM);

  const [mode, setModeState] = useState<StationComposerMode>(() =>
    resolveStationComposerMode(urlRaw, readStationComposerModeSession()),
  );

  useEffect(() => {
    const next = resolveStationComposerMode(urlRaw, readStationComposerModeSession());
    setModeState((prev) => (prev === next ? prev : next));
  }, [urlRaw]);

  const setMode = useCallback(
    (next: StationComposerMode) => {
      setModeState(next);
      writeStationComposerModeSession(next);

      const params = readLiveSearchParams(searchParams.toString());
      if (next === STATION_COMPOSER_MODE_DEFAULT) {
        params.delete(STATION_COMPOSER_MODE_PARAM);
      } else {
        params.set(STATION_COMPOSER_MODE_PARAM, next);
      }
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const cycleMode = useCallback(() => {
    setMode(cycleStationComposerMode(mode));
  }, [mode, setMode]);

  return { mode, setMode, cycleMode };
}
