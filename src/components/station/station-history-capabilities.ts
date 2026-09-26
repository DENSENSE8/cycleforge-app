/** Station history (Tech / Packer benches) — declared grid surface capabilities. */

import type { GridSurfaceCapabilities } from '@/design-system/components/grid';

/** Tech / Packer history benches — day-banded log; never outbound triage wash. */
export const STATION_HISTORY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: true,
};
