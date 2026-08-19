/**
 * Station Displays — Root Index + push column SoT for scan-station right-edge
 * triage.
 *
 * **Index→leaf waist (propagates to desk rails):** {@link DisplaysIndexLeafStage}
 * — composed by {@link StationDisplaysPushStack} and desk
 * `DeskInspectorIndexShell` (`components/right-rail/`). Upgrade the stage /
 * {@link StationDisplayIndexList} here; desk peeks must not fork twins.
 *
 * Action Plane densify (Station Action vs Context planes):
 *   StationDenseFactStrip · StationActionDossierShell · useStationActionKeyBindings
 *
 * ```ts
 * import {
 *   StationDisplaysPushStack,
 *   DisplaysIndexLeafStage,
 *   StationActionDossierShell,
 *   STATION_DISPLAYS_HOST_PAD_CLASS,
 *   type DisplayIndexRow,
 * } from '@/components/station/displays';
 * ```
 */

export { STATION_DISPLAY_INDEX } from './display-index';
export type { DisplayIndexGroup, DisplayIndexRow } from './display-index';

export {
  STATION_DISPLAYS_HOST_PAD_CLASS,
} from './StationDisplaysPushColumn';

export { DisplaysIndexLeafStage } from './DisplaysIndexLeafStage';
export { StationDisplaysPushStack } from './StationDisplaysPushStack';
export type { DisplaysVisitFrame } from './StationDisplaysPushStack';
export {
  StationDisplaysHeaderActions,
  STATION_DISPLAYS_HEADER_ACTION_ACTIVE,
  STATION_DISPLAYS_HEADER_ACTION_CELL,
  STATION_DISPLAYS_HEADER_ACTION_FACE,
  STATION_DISPLAYS_HEADER_ACTION_GLYPH,
} from './StationDisplaysHeaderActions';
export { CartonDisplaysActionFloor } from './CartonDisplaysActionFloor';
export { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';
export { useDisplaysLeafChrome } from './displays-leaf-chrome';
export { useYieldStationDisplaysOnAssistantOpen } from './useYieldStationDisplaysOnAssistantOpen';
export { StationDenseFactStrip } from './StationDenseFactStrip';

export { StationActionDossierShell } from './StationActionDossierShell';
export type { StationActionDossierRow } from './StationActionDossierShell';

export {
  useStationActionKeyBindings,
} from './StationActionKeyLegend';
export type { StationActionKeyBinding } from './StationActionKeyLegend';
