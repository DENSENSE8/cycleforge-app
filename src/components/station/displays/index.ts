/** Station Displays — Root Index + push column SoT for scan-station right-edge triage. */

export { STATION_DISPLAY_INDEX, STATION_LOOK_DISPLAY_ID } from './display-index';
export type { DisplayIndexGroup, DisplayIndexRow } from './display-index';
export { isDisplaysHostedLeaf, resolveDisplaysActiveTab } from './display-index';

export { STATION_DISPLAYS_HOST_PAD_CLASS } from './StationDisplaysPushColumn';
export { STATION_DISPLAYS_PUSH_TOP_BAND } from '@/components/station/entity-context/station-identity-chrome';

export { DisplaysIndexLeafStage } from './DisplaysIndexLeafStage';
export { StationDisplaysParkedRail } from './StationDisplaysParkedRail';
export { StationDisplaysUtilityRail } from './StationDisplaysUtilityRail';
export { StationDisplaysPushStack } from './StationDisplaysPushStack';
export type { DisplaysVisitFrame } from './StationDisplaysPushStack';
// StationDisplaysHeaderActions + its face tokens are NOT re-exported here:
// the carton compound is their only consumer and imports the module directly.
// Add a re-export when a second station needs it through the barrel.
export { CartonDisplaysActionFloor } from './CartonDisplaysActionFloor';
export { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';
export { useDisplaysLeafChrome } from './displays-leaf-chrome';
export { StationDenseFactStrip } from './StationDenseFactStrip';

export { StationActionDossierShell } from './StationActionDossierShell';
export type { StationActionDossierRow } from './StationActionDossierShell';

export {
  useStationActionKeyBindings,
} from './StationActionKeyLegend';
export type { StationActionKeyBinding } from './StationActionKeyLegend';
