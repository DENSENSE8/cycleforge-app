import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/**
 * `/receiving` — boundary parse for the legacy shell and its `history` / `lines` /
 * `unfound` children (HISTORY_ROUTE_PARAMS governs `/receiving/history`).
 *
 * The graduated scan routes (`/unbox`, `/triage`, `/incoming`, `/pickup`,
 * `/repair`) are siblings, not children, so each mounts its own — see those pages.
 * Placement rules: `@/components/routing/SurfaceParamHygiene`.
 */
export default function ReceivingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      {children}
    </>
  );
}
