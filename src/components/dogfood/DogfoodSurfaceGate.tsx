import type { ReactNode } from 'react';
import {
  isParkedSurfaceLive,
  type ParkedSurfaceKey,
} from '@/lib/dogfood/parked-surfaces';
import { ParkedSurface } from '@/components/dogfood/ParkedSurface';

export interface DogfoodSurfaceGateProps {
  /** Parked surface id (matches nav / PARKED_SURFACE_KEYS). */
  surface: ParkedSurfaceKey;
  children: ReactNode;
}

/**
 * Soft URL gate for parked dogfood surfaces (main pane).
 *
 * Default: `ParkedSurface` stand-in (real workspace not mounted).
 * Unlock: `DOGFOOD_FULL_SURFACE` / `NEXT_PUBLIC_DOGFOOD_FULL_SURFACE=1`.
 *
 * Prefer wrapping a route `layout.tsx` so nested pages are gated too.
 * The app shell sidebar is gated separately in `SidebarContextPanel`.
 */
export function DogfoodSurfaceGate({ surface, children }: DogfoodSurfaceGateProps) {
  if (isParkedSurfaceLive()) {
    return <>{children}</>;
  }
  return <ParkedSurface surface={surface} variant="page" />;
}
