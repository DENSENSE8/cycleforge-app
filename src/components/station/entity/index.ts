/**
 * Entity station family — the host composition for ONE record in station
 * chrome, whatever the record is.
 *
 * Per-entity identity adapters live beside their domain (`station/order/` for
 * `OrderStationIdentity`). Recipe: `docs/rules/display/unbox-station.md`.
 */

export { EntityStationPane } from './EntityStationPane';
export type {
  EntityStationPaneProps,
  StationStance,
  StationDisplayNav,
} from './EntityStationPane';
