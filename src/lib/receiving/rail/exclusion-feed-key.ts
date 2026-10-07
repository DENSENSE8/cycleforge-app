/** Maps a receiving rail (feed id + cache scope) to the staff_rail_exclusions `feed_key` its dismiss/read-filter uses (universal-feed plan… */

import type { ReceivingRailFeedId } from './feeds';
import type { ReceivingRailFeedKey } from '@/lib/receiving/rail-exclusions';

export function railExclusionFeedKey(feedId: ReceivingRailFeedId): ReceivingRailFeedKey | null {
  if (feedId === 'triageCombined') return 'receiving_triage';
  if (feedId === 'unboxRecent') return 'receiving_unbox';
  return null;
}

/**
 * Translate an exclusion (entity_type, entity_id) into the rail-id the rows use
 * (getRowId = row.id): a receiving line keeps its positive id; an unfound carton
 * stub is the NEGATED receiving_id (feeds.ts shapes stub rows with id < 0).
 */
export function exclusionToRailId(entityType: string, entityId: number): number {
  return entityType === 'RECEIVING' ? -entityId : entityId;
}
