'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useScanStance, type StationScanStance } from './scan-stance';

/**
 * Unbox's scan-dock filter contract — the one SoT every floor recent rail
 * mounts. Preview turns the scan bar into the rail's find field; leaving
 * Preview drops the query so Scan cannot look filtered with no chrome saying
 * why. Facets ride `filterSlot` on the bar (never a footer SearchField).
 */
export function useScanPreviewRailFilter() {
  const previewFiltering = useScanStance() === 'preview';
  const [railFilter, setRailFilter] = useState('');

  useEffect(() => {
    if (previewFiltering) return;
    setRailFilter('');
  }, [previewFiltering]);

  return { previewFiltering, railFilter, setRailFilter };
}

/**
 * Right-rail composition Unbox already uses: facets only while Preview is the
 * find field; mode glyphs only while Scan will commit.
 */
export function composeStationScanBarRightContent(
  stance: StationScanStance,
  filterSlot: ReactNode | undefined,
  modeRail: ReactNode,
): ReactNode | undefined {
  if (!filterSlot && stance !== 'scan') return undefined;
  return (
    <>
      {filterSlot}
      {stance === 'scan' ? modeRail : null}
    </>
  );
}
