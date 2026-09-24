import { PackerSurfacePage } from '@/components/packer/PackerSurfacePage';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/**
 * `/pack` — the Packing operator surface as a first-class, semantic route
 * (Studio-driven operator surfaces refactor Phase 7). The URL names the
 * operator's job. Legacy `/packer` redirects here via the proxy; on phones both
 * `/pack` and `/packer` UA-rewrite to the `/m/pack` mobile shell.
 */
export default function PackPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <ModeRegion mode="industrial" className="contents">
        <PackerSurfacePage fallbackPath="/pack" />
      </ModeRegion>
    </>
  );
}
