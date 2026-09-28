'use client';

/**
 * /sourcing — the universal sourcing operational hub (demand → scour → acquire).
 * Views, Find, filters and verbs live in the contextual sidebar
 * (`SIDEBAR_PAGE_NAV.sourcing`, `NAV_PAGE_DECLS.sourcing`); this is the stage.
 */

import { Suspense } from 'react';
import { SourcingWorkspace } from '@/components/sourcing/SourcingWorkspace';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

export default function SourcingPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <Suspense>
        <SourcingWorkspace />
      </Suspense>
    </>
  );
}
