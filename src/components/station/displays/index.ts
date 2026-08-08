/**
 * Station Displays — Root Index + push column SoT for scan-station right-edge
 * triage. Desk `RightRailHost` inspectors stay under `components/right-rail/`.
 *
 * Action Plane densify (Station Action vs Context planes):
 *   StationDenseFactStrip · StationActionDossierShell · StationActionKeyLegend
 *
 * ```ts
 * import {
 *   StationDisplaysPushStack,
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

export { StationDisplaysPushStack } from './StationDisplaysPushStack';
export { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';

export { StationDenseFactStrip } from './StationDenseFactStrip';

export { StationActionDossierShell } from './StationActionDossierShell';
export type { StationActionDossierRow } from './StationActionDossierShell';

export {
  StationActionKeyLegend,
  useStationActionKeyBindings,
} from './StationActionKeyLegend';
export type { StationActionKeyBinding } from './StationActionKeyLegend';
