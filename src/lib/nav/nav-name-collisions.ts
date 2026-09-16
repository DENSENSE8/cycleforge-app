/**
 * **THE LAW: a parent and a child must never wear the same name.**
 *
 * Operator ruling 2026-09-14: *"There should never be something like a display
 * for the inbound, it should never display the same child and parent name."*
 *
 * It was not a cosmetic complaint. The Inbound lane printed one word at three
 * altitudes — lane `Inbound` → row `Inbound` → tab `Inbound` — so the nav told
 * the operator the same thing three times and answered none of the three
 * questions a hierarchy exists to answer. Each altitude must answer a DIFFERENT
 * one:
 *
 * | Altitude | Question | Inbound lane |
 * |---|---|---|
 * | Lane | which direction of work? | **Inbound** |
 * | Row | which object? | **Deliveries** · Sourcing |
 * | Tab | which state of it? | **On the way** · History · PO Mailbox |
 *
 * ## Why this is a TEST and not a design-mcp refuse rule
 *
 * `tools/design-mcp/server.mjs` says it out loud: *"a tool that answered
 * 'allowed' while nothing enforced anything would manufacture confidence …
 * ESLint and the Boundary gate are this repo's machines."* A name collision is
 * also undecidable by the only thing a refuse rule can see — a `diffPattern`
 * regex over one file's text cannot know that a lane's label equals a member
 * page's label, because those are two declarations in two arrays.
 *
 * So the machine is this module plus its test, which runs in verify's **Unit
 * tests** gate; `ds_nav_names` is its MCP face, exactly as `ds_boundary` is the
 * face of `scripts/boundary-guard.ts`. The law is decidable, has zero false
 * positives, and fails the gate rather than a reviewer's memory.
 *
 * ## What it checks — the PAINTED pairings, not every declaration
 *
 * A pair only collides if an operator can see both names at once:
 *
 * 1. **Multi-page lane → its rows.** `Inbound` over `Deliveries` · `Sourcing`.
 * 2. **Single-page lane → that page's own children**, because the expansion
 *    ruling (2026-09-14) paints them as the lane's rows. The page's own label
 *    is NOT painted there, which is exactly why `Products` (lane) over
 *    `Reference` · `Manuals` · … is legal even though a `products` PAGE
 *    labelled "Products" exists.
 * 3. **Any page with children → those children**, which is the desk tab row
 *    (`useDeskPageChromeTabs`) and the spine's `kind: 'parent'` block.
 * 4. **Every `/m` drawer group → its children.**
 *
 * Comparison is trimmed and case-insensitive: `Inbound` / `inbound` / `INBOUND`
 * are the same word to an operator reading a column.
 */

import { MOBILE_NAV_DESTINATIONS } from '@/lib/mobile/nav-registry';
import {
  APP_SIDEBAR_NAV,
  DESK_SPINE_SECTIONS,
  SIDEBAR_PAGE_NAV,
  getSidebarPageNav,
  isSpineDeskItem,
  spineSectionIdForPage,
} from '@/lib/sidebar-navigation';

export interface NavNameCollision {
  /** Which painted relationship produced the clash. */
  where:
    | 'lane → row'
    | 'lane → expanded child'
    | 'page → tab'
    | 'drawer group → row';
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

  for (const item of MOBILE_NAV_DESTINATIONS) {
    if (item.kind !== 'group') continue;
    for (const child of item.children) {
      pairs.push({
        where: 'drawer group → row',
        parentId: item.id,
        parentLabel: item.label,
        childId: child.id,
        childLabel: child.label,
      });
    }
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
