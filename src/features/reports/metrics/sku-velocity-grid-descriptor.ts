import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import {
  SKU_VELOCITY_COMPOUND_COLUMNS,
  skuVelocitySortFactFor,
  defaultDirForSkuVelocityGridSort,
  type SkuVelocityGridColumn,
} from '@/lib/reports/sku-velocity-grid-layout';
import type { SkuVelocityRow } from '@/features/reports/metrics/report-rows';

export const SKU_VELOCITY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeSkuVelocityGridDescriptor(
  visible: readonly SkuVelocityGridColumn[],
): GridSurfaceDescriptor<SkuVelocityRow, SkuVelocityGridColumn> {
  return makeGridSurfaceDescriptor<SkuVelocityRow, SkuVelocityGridColumn>(
    'reports.sku-velocity',
    visible,
    {
      isSortable: (key) => {
        const col = visible.find((c) => c.key === key);
        return col ? skuVelocitySortFactFor(col) != null : false;
      },
      sortDescFirst: (key) => {
        const col = visible.find((c) => c.key === key);
        const fact = col ? skuVelocitySortFactFor(col) : null;
        return fact ? defaultDirForSkuVelocityGridSort(fact) === 'desc' : false;
      },
    },
    SKU_VELOCITY_GRID_CAPABILITIES,
  );
}

export { SKU_VELOCITY_COMPOUND_COLUMNS };
