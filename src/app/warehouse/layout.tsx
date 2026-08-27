import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/**
 * Warehouse is live on dogfood prod — no parked-surface gate.
 *
 * Boundary parse in the LAYOUT: WAREHOUSE_ROUTE_PARAMS governs `/warehouse` plus
 * its `replenishment` and `rma` children by prefix. Placement rules:
 * `@/components/routing/SurfaceParamHygiene`.
 */
export default function WarehouseLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      {children}
    </>
  );
}
