import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { UnboxBrowseShell } from '@/components/receiving/unbox/UnboxBrowseShell';

/** `/unbox` — the Unbox operator surface as a first-class, semantic route (Studio-driven operator surfaces refactor). */
export default async function UnboxPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <UnboxBrowseShell>
        <SurfaceGate surfaceKey="unbox">
          <ReceivingSurfacePage />
        </SurfaceGate>
      </UnboxBrowseShell>
    </>
  );
}
