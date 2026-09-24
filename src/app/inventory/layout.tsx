import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { InventoryDeskFrame } from '@/components/inventory/InventoryDeskFrame';

/**
 * `/inventory` — the Inventory **desk**.
 *
 * Inventory is live on dogfood prod — no parked-surface gate.
 *
 * The boundary parse lives HERE rather than in `page.tsx`: INVENTORY_ROUTE_PARAMS
 * governs `/inventory` and its twelve child segments by prefix, and a hook in the
 * root page left every one of them unparsed. Placement rules:
 * `@/components/routing/SurfaceParamHygiene`.
 *
 * The desk frame landed 2026-08-31. Inventory's modes are already PATHS
 * (`/inventory`, `/inventory/triage`, `/pulse`, `/graph`, `/locations`), so the
 * layout is the natural tab host: Next keeps it mounted across the siblings and
 * switching a tab swaps only the body. The detail routes underneath
 * (`/inventory/sku/[sku]`, `/inventory/location/[barcode]`, …) wear the same
 * frame with no tab lit — honest, and a way back rather than a dead end.
 *
 * **`InventoryShell` no longer draws its own title.** It carried a hand-rolled
 * `PageHeader` at `max-w-5xl` — a second page-header primitive on a second
 * measure — which is exactly the fork the chrome was made the design system's
 * to end.
 *
 * **Rail-less (operator 2026-09-15).** Inventory is `deskChrome` + `railless`:
 * the left context column does not mount on ledger, triage, pulse, graph,
 * replenish, locations, or the folded `/warehouse` aliases.
 *
 * **Stock · SKU Exceptions run flush** (owner 2026-09-24): the record-ledger
 * tabs wear the industrial bar and a full-width stage in a triage region;
 * the other tabs keep the card until they adopt the ledger
 * (`InventoryDeskFrame`).
 */
export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      <InventoryDeskFrame>{children}</InventoryDeskFrame>
    </>
  );
}
