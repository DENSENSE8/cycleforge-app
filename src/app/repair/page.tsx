import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/** `/repair` — Repair intake, a Receiving mode with its own graduated route (the sibling of Local Pickup at `/pickup`). */
export default function RepairPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <SurfaceGate surfaceKey="repair">
        <ReceivingSurfacePage />
      </SurfaceGate>
    </>
  );
}
