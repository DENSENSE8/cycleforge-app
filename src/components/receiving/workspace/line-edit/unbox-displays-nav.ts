/** Unbox Displays navigation predicates — cockpit auto-follow vs operator browse. */

import { UNBOX_DISPLAY_INDEX, type UnboxDisplayNav, type UnboxSideTab } from './unbox-side-tabs';

/**
 * Operator is on Displays Root Index — cockpit must not steal a rail leaf
 * until the CARTON changes (new record). Step settle / contents→inventory
 * auto-follow must not bounce Back-to-index back onto Inventory.
 */
export function shouldCockpitYieldToDisplaysIndex(
  requestedDisplay: UnboxDisplayNav | null,
  cartonChanged: boolean,
): boolean {
  return requestedDisplay === UNBOX_DISPLAY_INDEX && !cartonChanged;
}

/**
 * Item-photos Compare auto-open — only when Displays is closed or already on
 * Photos. Never yank Root Index, Inventory, Linkage, Ticket, …
 */
export function shouldItemPhotosCompareAutoOpen(args: {
  requestedDisplay: UnboxDisplayNav | null;
  activeLeaf: UnboxSideTab | null;
}): boolean {
  if (args.requestedDisplay === UNBOX_DISPLAY_INDEX) return false;
  if (args.activeLeaf != null && args.activeLeaf !== 'photos') return false;
  return true;
}
