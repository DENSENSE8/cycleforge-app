/**
 * Station workbench — **SoT** for Unbox-family station display anatomy.
 *
 * Compose {@link StationWorkbench} instead of hand-rolling
 * `relative flex h-full min-h-0 flex-col` + scroll + dock recipes.
 *
 * ```ts
 * import {
 *   StationWorkbench,
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
export { StationPanelRoot } from './StationPanelRoot';
export {
  SectionTabsRightTrack,
  SectionTabsRightPill,
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
  // Body pad is intentionally empty (flush to rails). Export kept so surfaces
  // that compose the token (StationWorkbench · UnboxLookupReceipt) stay on one
  // SoT instead of reintroducing `px-4 sm:px-6` literals.
  STATION_WORKBENCH_BODY_PAD_X,
  STATION_WORKBENCH_IDENTITY_COLUMN,
  STATION_WORKBENCH_HEADER_COLUMN,
  STATION_WORKBENCH_BODY_COLUMN,
  STATION_WORKBENCH_BODY_DOCKED,
} from './workbench-layout';
export { StationScanPaneHost } from './StationScanPaneHost';
export { ScanStationCartonCursor } from './ScanStationCartonCursor';
// ScanStationUtilityRail + STATION_UTILITY_RAIL_CLASS are internal to
// StationScanPaneHost — import the host, not the rail. Guards read the
// defining modules directly.
export {
  StationWorkspaceSkeleton,
} from './StationWorkspaceSkeleton';
