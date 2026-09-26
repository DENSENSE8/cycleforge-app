import { PackerSurfacePage } from '@/components/packer/PackerSurfacePage';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** `/pack` — the Packing operator surface as a first-class, semantic route (Studio-driven operator surfaces refactor Phase 7). */
export default function PackPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <ModeRegion mode="triage" className="contents">
        <PackerSurfacePage fallbackPath="/pack" />
      </ModeRegion>
    </>
  );
}
