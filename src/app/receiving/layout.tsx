import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/** `/receiving` — boundary parse for the legacy shell and its `history` / `lines` / `unfound` children (HISTORY_ROUTE_PARAMS governs… */
export default function ReceivingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      {children}
    </>
  );
}
