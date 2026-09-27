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
