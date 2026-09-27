import { PackerSurfacePage } from '@/components/packer/PackerSurfacePage';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/** `/pack` — the Packing operator surface as a first-class, semantic route (Studio-driven operator surfaces refactor Phase 7). */
export default function PackPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <PackerSurfacePage fallbackPath="/pack" />
    </>
  );
}
