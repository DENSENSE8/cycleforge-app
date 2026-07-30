import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/**
 * `/unbox` — the Unbox operator surface as a first-class, semantic route
 * (Studio-driven operator surfaces refactor). The URL names the operator's job.
 *
 * Wrapped in `SurfaceGate`: when the org has published a composition AND enabled
 * the `surface_composed_render` flag, the data-driven `SurfaceRenderer` renders;
 * otherwise the proven legacy `ReceivingSurfacePage` renders unchanged (the
 * `'legacy'` escape hatch — the safe default). Legacy `/receiving?mode=receive`
 * and bare `/receiving` redirect here.
 */
export default function UnboxPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <SurfaceGate surfaceKey="unbox">
        <ReceivingSurfacePage mobileTitle="Unbox" surface="unbox" />
      </SurfaceGate>
    </>
  );
}
