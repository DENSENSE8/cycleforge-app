'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useScanStance, type StationScanStance } from './scan-stance';

/** Unbox's scan-dock filter contract — the one SoT every floor recent rail mounts. */
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
