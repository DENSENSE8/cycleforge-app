'use client';

/**
 * Right-pane idle / loading skeleton for the Unbox workspace.
 * Thin domain wrapper over {@link StationWorkspaceSkeleton}.
 */

import { StationWorkspaceSkeleton } from '@/components/station/workbench';
import {
  RECEIVING_WORKSPACE_BODY_COLUMN,
  RECEIVING_WORKSPACE_HEADER_COLUMN,
} from './receiving-workspace-layout';

export function ReceivingWorkspaceSkeleton({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <StationWorkspaceSkeleton
      header={showHeader ? 'stepper-toolbar' : 'none'}
      bodyColumnClassName={RECEIVING_WORKSPACE_BODY_COLUMN}
      headerColumnClassName={RECEIVING_WORKSPACE_HEADER_COLUMN}
      label="Loading workspace"
    />
  );
}
