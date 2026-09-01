'use client';

/**
 * Station Displays → **Look** — live scan-station skin try-on.
 *
 * The trough beside this column IS the preview. ↑↓ / click applies
 * `applyStationSkin` immediately and persists the staff preference, so the
 * operator never has to bounce through Settings → Appearance to compare
 * Porcelain against Coal. One skin, every scan station — this leaf does not
 * fork per-bench fills.
 *
 * Injected by {@link StationDisplaysPushStack} onto every Action-plane host
 * (Unbox · Arrival · Pack · Testing · Scan-out · Search · Review). Do not
 * register a second Look tab in a station builder.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers } from '@/components/Icons';
import {
  StationArmedVerbList,
  type StationArmedVerb,
} from '@/components/station/displays/StationArmedVerbList';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import {
  STATION_SKIN_GROUP_LABEL,
  STATION_SKIN_GROUP_ORDER,
  STATION_SKIN_NAMES,
  STATION_SKINS,
  resolveStationSkin,
} from '@/design-system/themes/station-skins';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { applyStationSkin, isStationSkinName } from '@/lib/theme/station-skin';
import { cn } from '@/utils/_cn';

export function StationLookDisplayHost() {
  const { prefs, update } = useStaffPreferences();
  const saved = resolveStationSkin(prefs?.stationSkin).name;
  const [current, setCurrent] = useState(saved);
  const currentRef = useRef(saved);

  useEffect(() => {
    setCurrent(saved);
    currentRef.current = saved;
  }, [saved]);

  const applySkin = useCallback(
    (id: string) => {
      if (!isStationSkinName(id)) return;
      if (id === currentRef.current) return;
      currentRef.current = id;
      setCurrent(id);
      applyStationSkin(id);
      update({ stationSkin: id });
    },
    [update],
  );

  const verbs = useMemo<StationArmedVerb[]>(
    () =>
      STATION_SKIN_GROUP_ORDER.flatMap((group) =>
        STATION_SKIN_NAMES.filter((name) => STATION_SKINS[name].group === group).map(
          (name) => {
            const skin = STATION_SKINS[name];
            const onNow = name === current;
            return {
              id: name,
              label: skin.label,
              icon: Layers,
              subtitle: onNow
                ? `${STATION_SKIN_GROUP_LABEL[group]} · on now`
                : STATION_SKIN_GROUP_LABEL[group],
            };
          },
        ),
      ),
    [current],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p
        className={cn(
          'shrink-0 border-b border-border-hairline py-2 text-role-caption text-text-muted',
          DISPLAYS_BODY_INSET,
        )}
      >
        ↑↓ paints the trough beside this list. The skin saves to this account.
      </p>
      <StationArmedVerbList
        verbs={verbs}
        activeId={current}
        onArm={applySkin}
        onCommit={applySkin}
        listLabel="Scan station look"
        testId="station-look-display"
      />
    </div>
  );
}
