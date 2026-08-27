'use client';

import { usePathname } from 'next/navigation';
import { hasSidebarContextPanel } from '@/lib/sidebar-navigation';

/**
 * Does the current location actually have a context panel to render?
 *
 * It is now purely a route-key question. This hook used to carry one param-aware
 * exception: `/dashboard?mode=inbound` reserved a 360px column whose panel
 * returned `null`, so the answer had to inspect `?mode=`. Phase 1.1 of the
 * dashboard IA rework gave the inbound domain a real picker (recents), so the
 * exception has nothing left to except — and the hook stops being the one place
 * that knew a route key could lie about its own panel.
 *
 * One consumer: `ContextPanelLayout`, which uses it to decide whether to mount
 * the rail column beside the workspace at all.
 */
export function useHasSidebarContext(): boolean {
  return hasSidebarContextPanel(usePathname());
}
