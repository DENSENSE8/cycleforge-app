import { IncomingBrowseShell } from '@/components/receiving/incoming/IncomingBrowseShell';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/** `/incoming` — the Incoming operator surface (POs Zoho says are issued but not yet received locally; attach-tracking worklist). */
export default function IncomingPage() {
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
