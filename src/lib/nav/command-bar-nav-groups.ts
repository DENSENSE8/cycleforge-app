/**
 * ⌘K palette page buckets — Pin → SPINE_SECTIONS → Footer.
 *
 * Composes {@link APP_SIDEBAR_NAV} / {@link getSidebarNavItems} +
 * {@link spineSectionIdForPage} + {@link spineAccentFor}. Never invents a
 * second nav map or section labels.
 */

import { searchNav } from '@/lib/nav/nav-search';
import {
  spineAccentFor,
  type SpineAccentClasses,
} from '@/lib/nav/spine-section-accent';
import {
  APP_SIDEBAR_NAV,
  filterPageChildren,
  getSidebarNavItems,
  getSidebarPageNav,
  isSidebarPageReachable,
  SPINE_SECTIONS,
  STATION_SUBGROUPS,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarNavItem,
  type SpineSectionId,
  type StationSubgroupId,
} from '@/lib/sidebar-navigation';

export type CommandBarNavBandId = SpineSectionId | 'pin' | 'footer';

type CommandBarNavPageRow = {
  type: 'page';
  id: string;
  label: string;
  href: string;
  icon: SidebarIconComponent;
  /** True for Receiving / Walk-In subgroup members under Scan Stations. */
  indented?: boolean;
};

type CommandBarNavSubgroupRow = {
  type: 'subgroup';
  id: StationSubgroupId;
  label: string;
  icon: SidebarIconComponent;
};

export type CommandBarNavRow = CommandBarNavPageRow | CommandBarNavSubgroupRow;

export type CommandBarNavGroup = {
  id: CommandBarNavBandId;
  label: string;
  /** Section glyph for heading tint; null for pin / footer. */
  sectionIcon: SidebarIconComponent | null;
  accent: SpineAccentClasses;
  rows: CommandBarNavRow[];
};

function toPageRow(item: SidebarNavItem, indented = false): CommandBarNavPageRow {
  return {
    type: 'page',
    id: item.id,
    label: item.label,
    href: item.href,
    icon: item.desktopIcon ?? item.icon,
    indented,
  };
}

/** Scan Stations: Receiving · Walk-In subgroup chrome + members, then other floor pages. */
function buildFloorRows(items: readonly SidebarNavItem[]): CommandBarNavRow[] {
  const rows: CommandBarNavRow[] = [];
  const consumed = new Set<string>();
  const emittedSubgroups = new Set<StationSubgroupId>();

  for (const item of items) {
    if (consumed.has(item.id)) continue;

    if (item.kind === 'station' && item.stationSubgroup) {
      const sg = item.stationSubgroup;
      if (!emittedSubgroups.has(sg)) {
        const def = STATION_SUBGROUPS.find((s) => s.id === sg);
        if (def) {
          rows.push({
            type: 'subgroup',
            id: def.id,
            label: def.label,
            icon: def.icon,
          });
        }
        emittedSubgroups.add(sg);
        for (const member of items) {
          if (member.kind === 'station' && member.stationSubgroup === sg) {
            rows.push(toPageRow(member, true));
            consumed.add(member.id);
          }
        }
      }
      continue;
    }

    rows.push(toPageRow(item));
    consumed.add(item.id);
  }

  return rows;
}

/**
 * Ordered palette groups mirroring MasterNav pin / sections / footer.
 * Empty groups (permission-filtered) are omitted.
 */
export function buildCommandBarNavGroups(
  permissions?: ReadonlySet<string>,
): CommandBarNavGroup[] {
  const base = permissions ? getSidebarNavItems({ permissions }) : APP_SIDEBAR_NAV;
  // Same reachability rule the spine applies: a page whose every mode was
  // permission-filtered is absent from the palette, not a row that opens onto a
  // denial state. Rows without a mode registry pass through untouched.
  const items = permissions
    ? base.filter((item) => {
        const page = getSidebarPageNav(item.id);
        return !page || isSidebarPageReachable(filterPageChildren(page, permissions));
      })
    : base;
  const groups: CommandBarNavGroup[] = [];

  const pinItems = items.filter((i) => i.kind === 'top');
  if (pinItems.length > 0) {
    groups.push({
      id: 'pin',
      label: 'Pin',
      sectionIcon: null,
      accent: spineAccentFor(null),
      rows: pinItems.map((i) => toPageRow(i)),
    });
  }

  for (const section of SPINE_SECTIONS) {
    const sectionItems = items.filter(
      (i) => spineSectionIdForPage(i) === section.id,
    );
    if (sectionItems.length === 0) continue;
    groups.push({
      id: section.id,
      label: section.label,
      sectionIcon: section.icon,
      accent: spineAccentFor(section.id),
      rows:
        section.id === 'floor'
          ? buildFloorRows(sectionItems)
          : sectionItems.map((i) => toPageRow(i)),
    });
  }

  const footerItems = items.filter((i) => i.kind === 'bottom');
  if (footerItems.length > 0) {
    groups.push({
      id: 'footer',
      label: 'Account',
      sectionIcon: null,
      accent: spineAccentFor(null),
      rows: footerItems.map((i) => toPageRow(i)),
    });
  }

  return groups;
}

/**
 * Filter page rows through the shared nav matcher. Subgroup chrome is dropped
 * while filtering (browse-time IA); matching Receiving pages stay indented.
 *
 * Ranking is applied WITHIN each band, not across them: the palette's bands are
 * the spine's sections, and re-sorting bands by best-hit would make the group
 * order jump around under the cursor while typing. Cross-band ranking is the
 * flat-list job, which is what the spine does.
 *
 * `href` rides as a keyword, so it is searchable but can never outrank a label.
 */
export function filterCommandBarNavGroups(
  groups: readonly CommandBarNavGroup[],
  query: string,
): CommandBarNavGroup[] {
  if (!query.trim()) return [...groups];

  return groups.flatMap((group) => {
    const pages = group.rows.filter(
      (row): row is CommandBarNavPageRow => row.type === 'page',
    );
    const ranked = searchNav(
      pages.map((row) => ({ ...row, keywords: [row.href] })),
      query,
    );
    if (ranked.length === 0) return [];
    // Drop the synthetic keyword field again — the row type is the palette's
    // contract, and widening it for a value no consumer renders would be a
    // second shape to keep in sync. Highlighting is the flat-list job.
    return [
      {
        ...group,
        rows: ranked.map(({ item }) => {
          const { keywords: _keywords, ...row } = item;
          return row;
        }),
      },
    ];
  });
}
