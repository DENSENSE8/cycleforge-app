import { Suspense } from 'react';
import { ReviewWorkspace } from '@/features/review/ReviewWorkspace';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/**
 * `/review` — the all-in-one Review station (WS-REVIEW). Modes: Packing
 * (default, photo/item decide) · Pairing (serial/SKU allocate). The sidebar is
 * slim chrome; the Workbench table + detail overlay own the map. Desktop-only
 * (see MOBILE_RESTRICTED_SIDEBAR_IDS). Plan §4.
 *
 * Leaf route (no child segments), so the page is the always-mounted host for the
 * boundary parse — see `@/components/routing/SurfaceParamHygiene` for why that
 * differs from `/inventory` and `/warehouse`.
 */
export default function ReviewPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <Suspense fallback={null}>
        <ReviewWorkspace />
      </Suspense>
    </>
  );
}
