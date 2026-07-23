/**
 * Shared chrome heights for ops queue / workbench tables — toolbar (40px) sits
 * above the column guide; date bands stick at `top-0` inside the scroll body.
 */

import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';

/** Scope labels for receiving-lines workbench modes (in-card toolbar). */
export function receivingTableScopeLabel(modeId: string): string {
  switch (modeId) {
    case 'unbox_queue':
      return 'Door queue';
    case 'unbox_viewed':
      return 'Recently viewed';
    case 'history':
      return 'History';
    case 'incoming':
      return 'Incoming';
    case 'receive':
      return 'Receiving';
    default:
      return 'Lines';
  }
}

export function receivingStageColumnLabel(axis: ReceivingActivityAxis): string {
  if (axis === 'unboxed') return 'Unboxed';
  if (axis === 'tested') return 'Tested';
  if (axis === 'received') return 'Received';
  return 'Scanned';
}
