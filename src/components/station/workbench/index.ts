/** Station workbench — **SoT** for Unbox-family station display anatomy. */

export { StationWorkbench } from './StationWorkbench';
export { StationPanelRoot } from './StationPanelRoot';
export { buildSectionTabs } from './build-section-tabs';
export {
  WorkspaceTimelineTab,
  type WorkspaceTimelineAnchor,
} from './WorkspaceTimelineTab';
export {
  STATION_WORKBENCH_COLUMN,
  // Body pad is intentionally empty (flush to rails). Export kept so surfaces
  // that compose the token (StationWorkbench · UnboxLookupReceipt) stay on one
  // SoT instead of reintroducing `px-4 sm:px-6` literals.
  STATION_WORKBENCH_BODY_PAD_X,
  STATION_WORKBENCH_IDENTITY_COLUMN,
  STATION_WORKBENCH_BODY_COLUMN,
} from './workbench-layout';
export { StationScanPaneHost } from './StationScanPaneHost';
// Station Displays SoT lives at `@/components/station/displays` — import push stack / index rows from there (not re-exported here).
export {
  StationWorkspaceSkeleton,
} from './StationWorkspaceSkeleton';
