/**
 * Shared chrome helpers for ops queue / workbench tables.
 */

import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';

export function receivingStageColumnLabel(axis: ReceivingActivityAxis): string {
  if (axis === 'unboxed') return 'Unboxed';
  if (axis === 'tested') return 'Tested';
  if (axis === 'received') return 'Received';
  return 'Scanned';
}
