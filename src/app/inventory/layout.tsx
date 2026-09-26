import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { InventoryDeskFrame } from '@/components/inventory/InventoryDeskFrame';

/**
 * `/inventory` — the Inventory **desk**.
 * **Rail-less (operator 2026-09-15).** Inventory is `deskChrome` + `railless`:
 * **Stock · SKU Exceptions run flush** (owner 2026-09-24): the record-ledger
 */
export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      <InventoryDeskFrame>{children}</InventoryDeskFrame>
    </>
  );
}
