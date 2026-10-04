/**
 * **THE LAW: a parent and a child must never wear the same name.**
 * Operator ruling 2026-09-14: *"There should never be something like a display
 */

import { MOBILE_V2_FULFILLMENT_DESTINATIONS } from '@/components/mobile/v2/mobile-v2-destinations';
import { domainLane } from '@/lib/nav/lanes';
import {
  APP_SIDEBAR_NAV,
  DESK_SPINE_SECTIONS,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  isSpineDeskItem,
  spineSectionIdForPage,
} from '@/lib/sidebar-navigation';

interface NavNameCollision {
  /** Which painted relationship produced the clash. */
  where:
    | 'lane → row'
    | 'lane → expanded child'
    | 'page → tab'
    | 'mobile application → destination';
  /** The parent's id (lane id / page id / group id). */
  parentId: string;
  parentLabel: string;
  childId: string;
  childLabel: string;
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Every parent/child pair an operator can read at once, with both names. */
function paintedPairs(): Array<Omit<NavNameCollision, 'where'> & { where: NavNameCollision['where'] }> {
  const pairs: NavNameCollision[] = [];

  for (const lane of DESK_SPINE_SECTIONS) {
    const members = APP_SIDEBAR_NAV.filter(
      (item) => isSpineDeskItem(item) && spineSectionIdForPage(item) === lane.id,
    );
    if (members.length > 1) {
      for (const member of members) {
        pairs.push({
          where: 'lane → row',
          parentId: lane.id,
          parentLabel: lane.label,
          childId: member.id,
          childLabel: member.label,
        });
      }
      continue;
    }
    // Single-page lane: the expansion ruling paints the PAGE'S children as the
    // lane's rows, so those are what sit under the lane label.
    const only = members[0];
    if (!only) continue;
    const page = getSidebarPageNav(only.id);
    if (only.spineFlat || page?.spineFlat) continue;
    for (const child of page?.children ?? []) {
      pairs.push({
        where: 'lane → expanded child',
        parentId: lane.id,
        parentLabel: lane.label,
        childId: child.id,
        childLabel: child.label,
      });
    }
  }

  for (const page of SIDEBAR_PAGE_NAV) {
    for (const child of page.children ?? []) {
      pairs.push({
        where: 'page → tab',
        parentId: page.id,
        parentLabel: page.label,
        childId: child.id,
        childLabel: child.label,
      });
    }
  }

  const fulfillment = domainLane('fulfillment');
  for (const child of MOBILE_V2_FULFILLMENT_DESTINATIONS) {
    pairs.push({
      where: 'mobile application → destination',
      parentId: fulfillment.id,
      parentLabel: fulfillment.label,
      childId: child.id,
      childLabel: child.label,
    });
  }

  return pairs;
}

/** Every place a child wears its parent's name. Empty = the law holds. */
export function findNavNameCollisions(): NavNameCollision[] {
  return paintedPairs().filter((pair) => same(pair.parentLabel, pair.childLabel));
}

/** One line per collision, for a CLI / MCP verdict. */
export function formatNavNameCollision(c: NavNameCollision): string {
  return `${c.where}: "${c.parentLabel}" (${c.parentId}) → "${c.childLabel}" (${c.childId})`;
}
