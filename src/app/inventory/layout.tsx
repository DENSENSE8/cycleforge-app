import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/**
 * Inventory is live on dogfood prod — no parked-surface gate.
 *
 * The boundary parse lives HERE rather than in `page.tsx`: INVENTORY_ROUTE_PARAMS
 * governs `/inventory` and its twelve child segments by prefix, and a hook in the
 * root page left every one of them unparsed. Placement rules:
 * `@/components/routing/SurfaceParamHygiene`.
 */
export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      {children}
    </>
  );
}
