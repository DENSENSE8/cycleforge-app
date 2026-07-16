import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';

/**
 * `/pickup` — Walk-In front-desk station (Sales · Local Pickup · Repair).
 * Job sub-mode via `?job=sales|pickup|repair` (default pickup). A Workbench
 * surface (list → select → edit), not a scan bench. Bare `/pickup` derives the
 * `pickup` mode path-first. Legacy `/receiving?mode=pickup` redirects here.
 *
 * Wrapped in `SurfaceGate` (composition + flag → SurfaceRenderer, else the
 * legacy tree — the safe default).
 */
export default function PickupPage() {
  return (
    <SurfaceGate surfaceKey="pickup">
      <ReceivingSurfacePage mobileTitle="Walk-In" />
    </SurfaceGate>
  );
}
