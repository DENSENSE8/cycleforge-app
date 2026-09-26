import { IncomingBrowseShell } from '@/components/receiving/incoming/IncomingBrowseShell';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** `/incoming` — the Incoming operator surface (POs Zoho says are issued but not yet received locally; attach-tracking worklist). */
export default function IncomingPage() {
  return (
    <>
      <SurfaceParamHygiene />
      {/* The one page frame (2026-08-31) — `@/design-system/components/DeskPageChrome` via {@link DeskPageLayout}. */}
      <ModeRegion mode="triage" className="contents">
        <DeskPageLayout className="h-full">
          <IncomingBrowseShell>
            <SurfaceGate surfaceKey="incoming">
              <ReceivingSurfacePage />
            </SurfaceGate>
          </IncomingBrowseShell>
        </DeskPageLayout>
      </ModeRegion>
    </>
  );
}
