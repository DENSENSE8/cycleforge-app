import { HydrationBoundary } from '@tanstack/react-query';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { UnboxBrowseFirstPaint } from '@/components/receiving/unbox/UnboxBrowseFirstPaint';
import { UnboxBrowseShell } from '@/components/receiving/unbox/UnboxBrowseShell';
import { seedUnboxQueue } from '@/lib/queries/unbox-spine-seed.server';

/**
 * `/unbox` — the Unbox operator surface as a first-class, semantic route
 * (Studio-driven operator surfaces refactor). The URL names the operator's job.
 *
 * Wrapped in `SurfaceGate`: when the org has published a composition AND enabled
 * the `surface_composed_render` flag, the data-driven `SurfaceRenderer` renders;
 * otherwise the proven legacy `ReceivingSurfacePage` renders unchanged (the
 * `'legacy'` escape hatch — the safe default). Legacy `/receiving?mode=receive`
 * and bare `/receiving` redirect here.
 *
 * Paint order: RSC seeds Queue spine into a HydrationBoundary and streams
 * {@link UnboxBrowseFirstPaint} as the LCP stand-in; the interactive desk
 * hydrates over the same cache key (To-ship / Packer golden).
 */
export default async function UnboxPage() {
  const seed = await seedUnboxQueue();

  return (
    <>
      <SurfaceParamHygiene />
      <HydrationBoundary state={seed.state}>
        {/*
          SSR stand-in also rendered here so the LCP element is in the RSC
          HTML even before the client shell mounts (belt-and-suspenders with
          UnboxBrowseShell's absolute overlay).
        */}
        <div className="sr-only" aria-hidden>
          <UnboxBrowseFirstPaint rows={seed.rows} />
        </div>
        <UnboxBrowseShell firstPaintRows={seed.rows}>
          <SurfaceGate surfaceKey="unbox">
            <ReceivingSurfacePage mobileTitle="Unbox" surface="unbox" />
          </SurfaceGate>
        </UnboxBrowseShell>
      </HydrationBoundary>
    </>
  );
}
