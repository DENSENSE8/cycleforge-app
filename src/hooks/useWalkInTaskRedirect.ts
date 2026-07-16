'use client';

/**
 * Legacy `/walk-in` task deep-links → Receiving Walk-In station (`/pickup`).
 * History stays on `/walk-in`; sales/repair intake redirects here.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { walkInStationHref, type WalkInJob } from '@/lib/walk-in/jobs';

function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/**
 * Returns true while a redirect is in flight (caller should show a spinner).
 * Handles:
 * - `?mode=sales` → `/pickup?job=sales`
 * - `?mode=repairs` / `?new=true` / `?openRepair=` → `/pickup?job=repair` (+ params)
 * - Mobile `?openRepair=` → `/m/rs/{id}`
 */
export function useWalkInTaskRedirect(): boolean {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = searchParams.get('mode');
  const openRepair = searchParams.get('openRepair');
  const isNew = searchParams.get('new') === 'true';
  const wantsStationTask =
    mode === 'sales' || mode === 'repairs' || isNew || !!openRepair;

  useEffect(() => {
    if (!wantsStationTask) return;

    if (openRepair && isMobileUserAgent()) {
      const targetId = Number(openRepair);
      if (Number.isFinite(targetId) && targetId > 0) {
        router.replace(`/m/rs/${targetId}`);
        return;
      }
    }

    const job: WalkInJob = mode === 'sales' ? 'sales' : 'repair';
    const extra: Record<string, string | null | undefined> = {};
    if (isNew) extra.new = 'true';
    if (openRepair) extra.openRepair = openRepair;
    const search = searchParams.get('search');
    if (search) extra.search = search;
    const tab = searchParams.get('tab');
    if (job === 'repair' && (tab === 'done' || tab === 'incoming')) {
      extra.tab = tab;
    }

    router.replace(walkInStationHref(job, extra));
  }, [isNew, mode, openRepair, router, searchParams, wantsStationTask]);

  return wantsStationTask;
}
