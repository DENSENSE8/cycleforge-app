import { HydrationBoundary } from '@tanstack/react-query';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { seedUnboxSpine } from '@/lib/queries/unbox-spine-seed.server';

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
 * Paint order: RSC seeds History spine into a HydrationBoundary so
 * `useReceivingLinesQuery` paints from cache on first HTML (Packer / To-ship
 * golden). Route `loading.tsx` already streams {@link UnboxWorkbenchSkeleton}.
 */
export default async function UnboxPage() {
  const seed = await seedUnboxSpine();

  return (
    <>
      <SurfaceParamHygiene />
      <HydrationBoundary state={seed.state}>
        <SurfaceGate surfaceKey="unbox">
          <ReceivingSurfacePage mobileTitle="Unbox" surface="unbox" />
        </SurfaceGate>
      </HydrationBoundary>
    </>
  );
}
