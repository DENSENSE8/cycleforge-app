import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/**
 * `/triage` — the Arrival operator surface (dock scan/identify before
 * unboxing). Shares the scan-bar + recent-rail sidebar body with Unbox; only
 * the right pane differs. Bare `/triage` derives the `triage` mode path-first.
 *
 * Paint: NO server seed (removed 2026-08-27, operator ruling). The History
 * spine seed this page carried (`seedUnboxSpine`) blocked TTFB on a self-fetch
 * — up to 150 rows through `/api/receiving-lines?phase=spine`, paying a full
 * `withAuth` re-entry — to warm a table Arrival never paints. The To-ship →
 * Arrival hop it existed for was already warm client-side (the QueryClient
 * survives soft navigation), and History cold-starts its own feed when it is
 * actually opened. Centre LCP remains scan + carton work (not a table).
 */
export default function TriagePage() {
  return (
    <>
      <SurfaceParamHygiene />
      <SurfaceGate surfaceKey="triage">
        <ReceivingSurfacePage />
      </SurfaceGate>
    </>
  );
}
