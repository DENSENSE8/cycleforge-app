import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';

/**
 * `/pickup` — Local Pickup, a Receiving mode with its own graduated route (like
 * `/unbox` and `/triage`). Front-desk pickup is receiving work: the operator
 * switches to it from the receiving mode rail, so this mounts the receiving
 * shell rather than a separate counter station. Repair is its sibling mode
 * (`/repair`); Sales is not a receiving mode at all — it lives on `/walk-in`.
 *
 * Legacy `/receiving?mode=pickup` and `/pickup?job=…` redirect here (proxy).
 *
 * Wrapped in `SurfaceGate` (composition + flag → SurfaceRenderer, else the
 * legacy tree — the safe default).
 */
export default function PickupPage() {
  return (
    <SurfaceGate surfaceKey="pickup">
      <ReceivingSurfacePage mobileTitle="Local Pickup" />
    </SurfaceGate>
  );
}
