'use client';

/** Station Displays → **Look** — live Color + Depth try-on. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Box, RotateCcw } from '@/components/Icons';
import {
  StationArmedVerbList,
  type StationArmedVerb,
} from '@/components/station/displays/StationArmedVerbList';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import {
  DEFAULT_STATION_DEPTH,
  STATION_DEPTH_NAMES,
  STATION_DEPTHS,
  resolveStationDepth,
  type StationDepthName,
} from '@/design-system/themes/station-depths';
import {
  DEFAULT_STATION_SKIN,
  STATION_SKIN_GROUP_LABEL,
  STATION_SKIN_GROUP_ORDER,
  STATION_SKIN_NAMES,
  STATION_SKINS,
  resolveStationSkin,
} from '@/design-system/themes/station-skins';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { applyStationDepth, isStationDepthName } from '@/lib/theme/station-depth';
import { applyStationSkin, isStationSkinName } from '@/lib/theme/station-skin';
import { cn } from '@/utils/_cn';

type LookMethod = 'color' | 'depth';
const NORMAL_LOOK_ID = 'normal';

export function StationLookDisplayHost() {
  const { prefs, update } = useStaffPreferences();
  const savedSkin = resolveStationSkin(prefs?.stationSkin).name;
  const savedDepth = resolveStationDepth(prefs?.stationDepth).name;
  const [method, setMethod] = useState<LookMethod>('color');
  const [currentSkin, setCurrentSkin] = useState(savedSkin);
  const [currentDepth, setCurrentDepth] = useState(savedDepth);
  const skinRef = useRef(savedSkin);
  const depthRef = useRef(savedDepth);

  useEffect(() => {
    setCurrentSkin(savedSkin);
    skinRef.current = savedSkin;
  }, [savedSkin]);

  useEffect(() => {
    setCurrentDepth(savedDepth);
    depthRef.current = savedDepth;
  }, [savedDepth]);

  const applySkin = useCallback(
    (id: string) => {
      if (!isStationSkinName(id)) return;
      if (id === skinRef.current) return;
      skinRef.current = id;
      setCurrentSkin(id);
      applyStationSkin(id);
      update({ stationSkin: id });
    },
    [update],
  );

  const applyDepth = useCallback(
    (id: string) => {
      if (!isStationDepthName(id)) return;
      if (id === depthRef.current) return;
      depthRef.current = id;
      setCurrentDepth(id);
      applyStationDepth(id);
      update({ stationDepth: id });
    },
    [update],
  );

  const applyNormal = useCallback(() => {
    if (
      skinRef.current === DEFAULT_STATION_SKIN &&
      depthRef.current === DEFAULT_STATION_DEPTH
    ) {
      return;
    }
    skinRef.current = DEFAULT_STATION_SKIN;
    depthRef.current = DEFAULT_STATION_DEPTH;
    setCurrentSkin(DEFAULT_STATION_SKIN);
    setCurrentDepth(DEFAULT_STATION_DEPTH);
    applyStationSkin(DEFAULT_STATION_SKIN);
    applyStationDepth(DEFAULT_STATION_DEPTH);
    update({ stationSkin: DEFAULT_STATION_SKIN, stationDepth: DEFAULT_STATION_DEPTH });
  }, [update]);

  const applyColorSelection = useCallback(
    (id: string) => {
      if (id === NORMAL_LOOK_ID) {
        applyNormal();
        return;
      }
      applySkin(id);
    },
    [applyNormal, applySkin],
  );

  const applyDepthSelection = useCallback(
    (id: string) => {
      if (id === NORMAL_LOOK_ID) {
        applyNormal();
        return;
      }
      applyDepth(id);
    },
    [applyDepth, applyNormal],
  );

  const normalLookActive =
    currentSkin === DEFAULT_STATION_SKIN && currentDepth === DEFAULT_STATION_DEPTH;

  const colorVerbs = useMemo<StationArmedVerb[]>(
    () => [
      {
        id: NORMAL_LOOK_ID,
        label: 'Normal',
        icon: RotateCcw,
        subtitle: normalLookActive ? 'Original flat display · on now' : 'Original flat display',
      },
      ...STATION_SKIN_GROUP_ORDER.flatMap((group) =>
        STATION_SKIN_NAMES.filter((name) => STATION_SKINS[name].group === group).map(
          (name) => {
            const skin = STATION_SKINS[name];
            const onNow = name === currentSkin;
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
    ],
    [currentSkin, normalLookActive],
  );

  const depthVerbs = useMemo<StationArmedVerb[]>(
    () => [
      {
        id: NORMAL_LOOK_ID,
        label: 'Normal',
        icon: RotateCcw,
        subtitle: normalLookActive ? 'Original flat display · on now' : 'Original flat display',
      },
      ...STATION_DEPTH_NAMES.map((name: StationDepthName) => {
        const depth = STATION_DEPTHS[name];
        const onNow = name === currentDepth;
        return {
          id: name,
          label: depth.label,
          icon: Box,
          subtitle: onNow ? `${depth.hint} · on now` : depth.hint,
        };
      }),
    ],
    [currentDepth, normalLookActive],
  );

  const onColor = method === 'color';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'flex shrink-0 gap-1 border-b border-border-hairline py-2',
          DISPLAYS_BODY_INSET,
        )}
        role="tablist"
        aria-label="Look method"
      >
        {(
          [
            { id: 'color' as const, label: 'Color' },
            { id: 'depth' as const, label: 'Depth' },
          ] as const
        ).map((tab) => {
          const active = method === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`station-look-method-${tab.id}`}
              onClick={() => setMethod(tab.id)}
              className={cn(
                'ds-raw-button rounded-none px-2.5 py-1 text-role-caption font-semibold transition',
                active
                  ? 'bg-surface-hover text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <p
        className={cn(
          'shrink-0 border-b border-border-hairline py-2 text-role-caption text-text-muted',
          DISPLAYS_BODY_INSET,
        )}
      >
        {onColor
          ? '↑↓ paints trough fills. Depth stays put. Saves to this account.'
          : '↑↓ paints bevel and grain. Color stays put. Saves to this account.'}
      </p>
      {onColor ? (
        <StationArmedVerbList
          verbs={colorVerbs}
          activeId={normalLookActive ? NORMAL_LOOK_ID : currentSkin}
          onArm={applyColorSelection}
          onCommit={applyColorSelection}
          listLabel="Scan station color"
          testId="station-look-display-color"
        />
      ) : (
        <StationArmedVerbList
          verbs={depthVerbs}
          activeId={normalLookActive ? NORMAL_LOOK_ID : currentDepth}
          onArm={applyDepthSelection}
          onCommit={applyDepthSelection}
          listLabel="Scan station depth"
          testId="station-look-display-depth"
        />
      )}
    </div>
  );
}
