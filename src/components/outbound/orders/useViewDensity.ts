'use client';

/**
 * One list view's row density — the staffer's pick inside
 * `VIEW_SPECS[viewKey].density.allowed`, remembered per view beside the desk's
 * record view (`desk.<viewKey>.density`, Settings Registry, staff scope).
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSetting } from '@/hooks/useSettings';
import { viewDensitySettingKey } from '@/lib/settings/registry';
import type { ResolvedSetting } from '@/lib/settings/types';
import { VIEW_SPECS, viewDensity, type Density, type OrderListViewKey } from '@/lib/views/view-specs';

const DESK_SETTINGS_QUERY_KEY = ['page-settings', 'desk'] as const;

type DeskSettingsCache = { items: ResolvedSetting[] } | undefined;

export function useViewDensity(viewKey: OrderListViewKey): {
  density: Density;
  allowed: readonly Density[];
  setDensity: (next: Density) => void;
} {
  const key = viewDensitySettingKey(viewKey);
  const setting = useSetting<Density>('desk', key);
  const queryClient = useQueryClient();
  const { allowed } = VIEW_SPECS[viewKey].density;
  const density = viewDensity(viewKey, setting.value);
  const { set } = setting;

  const setDensity = useCallback(
    (next: Density) => {
      if (!allowed.includes(next) || next === density) return;
      // Optimistic: the toolbar and the rows read one cache, so both move on the click.
      const prev = queryClient.getQueryData<DeskSettingsCache>(DESK_SETTINGS_QUERY_KEY);
      queryClient.setQueryData<DeskSettingsCache>(DESK_SETTINGS_QUERY_KEY, (cache) =>
        cache
          ? {
              ...cache,
              items: cache.items.map((it) => (it.key === key ? { ...it, value: next, source: 'staff' } : it)),
            }
          : cache,
      );
      void set(next).catch(() => queryClient.setQueryData(DESK_SETTINGS_QUERY_KEY, prev));
    },
    [allowed, density, key, queryClient, set],
  );

  return { density, allowed, setDensity };
}
