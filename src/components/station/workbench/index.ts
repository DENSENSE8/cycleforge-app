/**
 * Station workbench — **SoT** for Unbox-family station display anatomy.
 *
 * Compose {@link StationWorkbench} instead of hand-rolling
 * `relative flex h-full min-h-0 flex-col` + scroll + dock recipes.
 *
 * ```ts
 * import {
 *   StationWorkbench,
 *   PairingTogglePill,
 *   ExternalLinkPill,
 *   buildSectionTabs,
 *   STATION_WORKBENCH_COLUMN,
 * } from '@/components/station/workbench';
 * ```
 *
 * Region contract (I/O + persistence per layer):
 *   `.claude/rules/display/station-workbench.md`
 */

export { StationWorkbench } from './StationWorkbench';
export {
  SectionTabsRightTrack,
  SectionTabsRightPill,
  PairingTogglePill,
  ExternalLinkPill,
} from './SectionTabsRightSlot';
export { buildSectionTabs, type SectionTabDef } from './build-section-tabs';
export {
  WorkspaceTimelineTab,
  type WorkspaceTimelineAnchor,
} from './WorkspaceTimelineTab';
export { StationUnitJourneys } from './StationUnitJourneys';
export {
  mergeStationUnitJourneys,
  type SerialJourneyBucket,
} from './merge-station-unit-journeys';
export {
  STATION_WORKBENCH_COLUMN,
  STATION_WORKBENCH_HEADER_COLUMN,
  STATION_WORKBENCH_BODY_COLUMN,
  STATION_WORKBENCH_BODY_DOCKED,
} from './workbench-layout';

export {
  StationWorkspaceSkeleton,
} from './StationWorkspaceSkeleton';

/** Re-export the thinner shell for callers that only need toolbar → body → dock. */
export { StationWorkbenchShell } from '@/components/station/terminal/StationWorkbenchShell';
