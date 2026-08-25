import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/**
 * `/repair` — Repair intake, a Receiving mode with its own graduated route (the
 * sibling of Local Pickup at `/pickup`). This route used to redirect into the
 * Walk-In station's `?job=repair` sub-mode; that station model is gone — the
 * jobs ARE receiving modes now, so `/repair` is a first-class surface again and
 * the proxy redirects `/pickup?job=repair` here instead.
 *
 * Gated by `receiving.view` like the rest of the rail; the `repair.*` tech
 * permissions still gate the repair APIs.
 *
 * Wrapped in `SurfaceGate` (composition + flag → SurfaceRenderer, else the
 * legacy tree — the safe default).
 */
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
