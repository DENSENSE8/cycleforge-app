import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** `/triage` — the Arrival operator surface (dock scan/identify before unboxing). */
export default function TriagePage() {
  return (
    <>
      <SurfaceParamHygiene />
      <SurfaceGate surfaceKey="triage">
        <ModeRegion mode="triage" className="contents">
          <ReceivingSurfacePage />
        </ModeRegion>
      </SurfaceGate>
    </>
  );
}
