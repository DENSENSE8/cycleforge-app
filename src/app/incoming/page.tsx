import { HydrationBoundary } from '@tanstack/react-query';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { seedIncomingLines } from '@/lib/queries/incoming-seed.server';

/**
 * `/incoming` — the Incoming operator surface (POs Zoho says are issued but not
 * yet received locally; attach-tracking worklist). A Workbench surface (list →
 * select → edit), not a scan bench. Bare `/incoming` derives the `incoming` mode
 * path-first. Legacy `/receiving?mode=incoming` redirects here.
 *
 * Wrapped in `SurfaceGate` (composition + flag → SurfaceRenderer, else the
 * legacy tree).
 *
 * Paint order: RSC seeds the bare-`/incoming` list into a HydrationBoundary so
 * the Inbound grid paints rows on first HTML instead of hydrating → firing one
 * client fetch → skeleton (the flagship resilience fix; mirrors `/unbox`).
 */
export default async function IncomingPage() {
  const seed = await seedIncomingLines();

  return (
    <>
      <SurfaceParamHygiene />
      <HydrationBoundary state={seed.state}>
        <SurfaceGate surfaceKey="incoming">
          <ReceivingSurfacePage mobileTitle="Inbound" />
        </SurfaceGate>
      </HydrationBoundary>
    </>
  );
}
