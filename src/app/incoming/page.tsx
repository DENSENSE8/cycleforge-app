import { Suspense } from 'react';
import { HydrationBoundary } from '@tanstack/react-query';
import { IncomingBrowseShell } from '@/components/receiving/incoming/IncomingBrowseShell';
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
 * Paint order: this page returns immediately. {@link IncomingBrowseShell}
 * puts a flush ledger stand-in in the first HTML (Speed Index). The full-list
 * seed runs in a nested Suspense so a slow `/api/receiving-lines` cannot hold
 * TTFB. Client still fetches if the seed bails.
 */
export default function IncomingPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <IncomingBrowseShell>
        <Suspense fallback={null}>
          <IncomingSeededSurface />
        </Suspense>
      </IncomingBrowseShell>
    </>
  );
}

async function IncomingSeededSurface() {
  const seed = await seedIncomingLines();
  return (
    <HydrationBoundary state={seed.state}>
      <SurfaceGate surfaceKey="incoming">
        <ReceivingSurfacePage />
      </SurfaceGate>
    </HydrationBoundary>
  );
}
