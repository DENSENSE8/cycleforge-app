import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { UnboxBrowseShell } from '@/components/receiving/unbox/UnboxBrowseShell';

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
 * Paint order: selected rail row → middle → right edge → the rest of the rail.
 *
 * **The seed is NOT here, and that is structural.** The recents rail is a
 * sibling of this page (`ResponsiveLayout` renders
 * `<ContextPanelLayout>{children}</ContextPanelLayout>`), so React renders it
 * BEFORE this page's tree — a `HydrationBoundary` mounted here could never
 * reach it, and the rail server-rendered empty while the seed sat unused in the
 * RSC payload. The seed now hydrates above the shell
 * (`maybeSeedUnboxShell`, called from the root layout) and covers this page too,
 * so the middle's carton lines still hydrate from cache exactly as before.
 *
 * The middle shows `UniversalLoader`'s field until the interactive workspace
 * hydrates over that same cache — the drawn skeleton that used to sit there
 * was retired 2026-08-20. Workbench tables mount only after Back to list
 * (`?unboxdesk=1`).
 *
 * There is no second, `sr-only` copy of the stand-in. One was mounted here as
 * "belt-and-suspenders" while the app shell was client-gated and nothing the
 * server rendered ever painted; with that gate gone the shell's own copy IS in
 * the HTML, so the duplicate only shipped the same markup twice.
 */
export default async function UnboxPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <UnboxBrowseShell>
        <SurfaceGate surfaceKey="unbox">
          <ReceivingSurfacePage />
        </SurfaceGate>
      </UnboxBrowseShell>
    </>
  );
}
