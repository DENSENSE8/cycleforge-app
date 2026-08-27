'use client';

/**
 * Right-pane skeleton loader for the **Triage** surface — triage's own skeleton,
 * never the unbox display. Thin domain wrapper over {@link StationWorkspaceSkeleton}
 * that composes the shared Station Workbench column tokens so the loading state
 * aligns to the same 720px identity/body column as the loaded carton — never a
 * local `max-w-3xl` recipe.
 */

import {
  StationWorkspaceSkeleton,
  STATION_WORKBENCH_IDENTITY_COLUMN,
  STATION_WORKBENCH_BODY_COLUMN,
} from '@/components/station/workbench';

const TRIAGE_HEADER_COLUMN = `${STATION_WORKBENCH_IDENTITY_COLUMN} flex items-center justify-between`;
const TRIAGE_BODY_COLUMN = STATION_WORKBENCH_BODY_COLUMN;

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
