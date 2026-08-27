'use client';

import { useEffect } from 'react';
import { registerScanDockPolicy, type ScanDockPolicy } from './store';

/**
 * Publish this surface's scan policy to the global dock.
 *
 * A surface calls this INSTEAD of rendering its own `ThemedStationScanBar`. The
 * input then lives in the header, above every route change, and this surface
 * only says how it should behave.
 *
 * Re-publishes on every change to the policy fields, so a mode rail that
 * re-renders (an armed mode toggled) reaches the dock without the surface
 * managing subscriptions.
 */
export function useScanDock(policy: ScanDockPolicy | null): void {
  const {
    id,
    placeholder,
    onSubmit,
    isResolving,
    staffId,
    rightContent,
  } = policy ?? ({} as Partial<ScanDockPolicy>);

  useEffect(() => {
    if (!id || !onSubmit) return;
    return registerScanDockPolicy({
      id,
      placeholder,
      onSubmit,
      isResolving,
      staffId,
      rightContent,
    });
  }, [id, placeholder, onSubmit, isResolving, staffId, rightContent]);
}
