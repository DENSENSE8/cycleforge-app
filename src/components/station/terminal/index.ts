// `STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` is deliberately NOT re-exported:
// its only consumer is `StationWorkbench`, which imports it from the concrete
// file (as it already does the default clearance). A barrel export nobody reads
// is dead weight the knip gate correctly rejects — add it here when a second
// caller outside this folder needs it.
export {
  StationTerminalDock,
  STATION_TERMINAL_SCROLL_CLEARANCE,
} from './StationTerminalDock';
export { useStationTerminalAction, type UseStationTerminalActionParams } from './useStationTerminalAction';
