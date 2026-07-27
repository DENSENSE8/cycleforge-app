export { StationRailDock, StationRailPortal, useHasStationRailDock } from './StationRailDock';
// `useStationRailDock` stays module-internal (StationRailDock.tsx imports it
// directly) — consumers use `useHasStationRailDock` / `StationRailPortal`.
export { StationRailDockProvider } from './StationRailDockContext';
