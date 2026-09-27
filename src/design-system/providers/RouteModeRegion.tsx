'use client';

/**
 * The page's region, applied ONCE by the app frame (`AppShellSwitch`) from the
 * declared route → mode registry (`src/lib/routing/mode-registry.ts`). Pages
 * do not mount their own page-level `ModeRegion`; a `runtime` route's layout
 * declares its mode itself.
 */

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { modeRouteFor } from '@/lib/routing/mode-registry';
import { useDeskFloorActive } from '@/design-system/components/DeskStageContext';
import { ModeRegion } from './ModeRegion';

export function RouteModeRegion({ children }: { children: ReactNode }) {
  const entry = modeRouteFor(usePathname());
  // `runtime`: the route's layout owns the switch. Undeclared routes are a
  // registry test failure; until fixed they paint the `:root` triage fallback.
  if (!entry || entry.mode === 'runtime') return <>{children}</>;
  // `contents`: the region stamps `data-mode` and its vars without adding a
  // box between the frame's flex slot and the page.
  return (
    <ModeRegion mode={entry.mode} className="contents">
      {children}
    </ModeRegion>
  );
}

/**
 * The chrome's region: app-frame chrome that sits OUTSIDE the page region
 * (the top bar) but must wear the page's look. Resolves exactly like the
 * page — the registry, and for a `runtime` route the Floor flag its layout
 * switches on (`src/app/shipping/layout.tsx`). `contents`, like the page
 * region: no box in the bar, and the region's own `color: var(--mode-ink)`
 * lands on the wrapper, not on the chrome's toned text.
 */
export function ChromeModeRegion({ children }: { children: ReactNode }) {
  const entry = modeRouteFor(usePathname());
  const floor = useDeskFloorActive();
  const mode = !entry || entry.mode === 'runtime' ? (floor ? 'industrial' : 'triage') : entry.mode;
  return (
    <ModeRegion mode={mode} className="contents">
      {children}
    </ModeRegion>
  );
}
