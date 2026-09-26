import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/** Warehouse is live on dogfood prod — no parked-surface gate. */
export default function WarehouseLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      {children}
    </>
  );
}
