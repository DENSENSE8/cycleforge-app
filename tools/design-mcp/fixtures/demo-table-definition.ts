/**
 * Planted Center Lock violation — inspector on a new table binding.
 */
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';

export const DEMO_TABLE_DEFINITION = {
  recordPlane: { kind: 'inspector', occupantId: 'detail:demo-order' },
} satisfies Pick<TableSurfaceBinding<unknown, never>, 'recordPlane'>;
