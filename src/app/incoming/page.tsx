import { IncomingBrowseShell } from '@/components/receiving/incoming/IncomingBrowseShell';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { permanentRedirect, redirect } from 'next/navigation';
import { legacyIncomingPurchasesDestination } from '@/lib/routing/parked-slot-surfaces';

/** `/incoming` — the Incoming operator surface (POs Zoho says are issued but not yet received locally; attach-tracking worklist). */
export default async function IncomingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.lane === 'exceptions') redirect('/exceptions?domain=receiving');
  // Purchases left Deliveries for its own Receiving mode (owner 2026-10-05): old links land there for good (308).
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, one);
  }
  const purchasing = legacyIncomingPurchasesDestination(query);
  if (purchasing) permanentRedirect(purchasing);
  return (
    <>
      <SurfaceParamHygiene />
      {/* The one page frame (2026-08-31) — `@/design-system/components/DeskPageChrome` via {@link DeskPageLayout}.
          No tab row (operator 2026-09-27): On the way / History, Find and the
          pasted-list check live in the contextual sidebar, as on Shipping. */}
      <DeskPageLayout bare className="h-full">
        <IncomingBrowseShell>
          <SurfaceGate surfaceKey="incoming">
            <ReceivingSurfacePage />
          </SurfaceGate>
        </IncomingBrowseShell>
      </DeskPageLayout>
    </>
  );
}
