import { HydrationBoundary } from '@tanstack/react-query';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { seedUnboxSpine } from '@/lib/queries/unbox-spine-seed.server';

/**
 * `/triage` — the Arrival operator surface (dock scan/identify before
 * unboxing). Shares the scan-bar + recent-rail sidebar body with Unbox; only
 * the right pane differs. Bare `/triage` derives the `triage` mode path-first.
 *
 * Paint: reuses Unbox History spine seed for the shared receiving-lines cache
 * root so the station does not cold-start the feed after a To-ship → Arrival
 * hop. Centre LCP remains scan + carton work (not the History table).
 */
export default async function TriagePage() {
  const seed = await seedUnboxSpine();

  return (
    <>
      <SurfaceParamHygiene />
      <HydrationBoundary state={seed.state}>
        <SurfaceGate surfaceKey="triage">
          <ReceivingSurfacePage mobileTitle="Arrival" surface="triage" />
        </SurfaceGate>
      </HydrationBoundary>
    </>
  );
}
