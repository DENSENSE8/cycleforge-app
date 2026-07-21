'use client';

/**
 * Right-pane skeleton loader for the **Triage** surface — triage's own skeleton,
 * never the unbox display. Thin domain wrapper over {@link StationWorkspaceSkeleton}
 * with Triage's `max-w-3xl` column recipe.
 */

import { StationWorkspaceSkeleton } from '@/components/station/workbench';

const TRIAGE_HEADER_COLUMN = 'mx-auto flex w-full max-w-3xl items-center justify-between px-4 sm:px-6';
const TRIAGE_BODY_COLUMN = 'mx-auto w-full min-w-0 max-w-3xl space-y-4 px-4 py-5 pb-32 sm:px-6';

export function TriageWorkspaceSkeleton({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <StationWorkspaceSkeleton
      header={showHeader ? 'toolbar' : 'none'}
      headerColumnClassName={TRIAGE_HEADER_COLUMN}
      bodyColumnClassName={TRIAGE_BODY_COLUMN}
      sectionRows={[3, 2, 2]}
      label="Loading carton"
    />
  );
}
