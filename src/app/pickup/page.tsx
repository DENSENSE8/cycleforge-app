import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/** `/pickup` — Local Pickup, a Receiving mode with its own graduated route (like `/unbox` and `/triage`). */
export default function PickupPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout bare className="h-full">
        <SurfaceGate surfaceKey="pickup">
          <ReceivingSurfacePage />
        </SurfaceGate>
      </DeskPageLayout>
    </>
  );
}
