import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/** `/pickup` — Local Pickup, a Receiving mode with its own graduated route (like `/unbox` and `/triage`). */
export default function PickupPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <SurfaceGate surfaceKey="pickup">
        <ReceivingSurfacePage />
      </SurfaceGate>
    </>
  );
}
