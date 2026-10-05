import { IncomingBrowseShell } from '@/components/receiving/incoming/IncomingBrowseShell';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { redirect } from 'next/navigation';

/** `/incoming` — the Incoming operator surface (POs Zoho says are issued but not yet received locally; attach-tracking worklist). */
export default async function IncomingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.lane === 'exceptions') redirect('/exceptions?domain=receiving');
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
