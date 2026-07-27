export { LedgerGrid } from './LedgerGrid';
export { LedgerCellEditor } from './LedgerCellEditor';
export { useGridSurface } from './useGridSurface';
export { LedgerGridSurface } from './LedgerGridSurface';
export {
  buildLedgerColumnDefs,
  makeGridSurfaceDescriptor,
} from './grid-surface-descriptor';
export type { GridSurfaceDescriptor, LedgerGridColumnModel } from './grid-surface-descriptor';
// The pure resolvers (`isGridColumnVisible` / `resolveGridColumns`) stay on the
// module, not the barrel — they exist for the guard tests and for anything that
// needs the rule without React. Surfaces compose the two hooks.
export { useGridColumnVisibility, useGridFields } from './useGridColumnVisibility';
