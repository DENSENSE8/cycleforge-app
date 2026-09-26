/** ⌘K palette page buckets — Pin → SPINE_SECTIONS. */

import { searchNav } from '@/lib/nav/nav-search';
import {
  spineAccentFor,
  type SpineAccentClasses,
} from '@/lib/nav/spine-section-accent';
import {
  filterPageChildren,
  getSidebarNavItems,
  getSidebarPageNav,
  isSidebarPageReachable,
  SPINE_SECTIONS,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarNavItem,
  type SpineSectionId,
} from '@/lib/sidebar-navigation';

type CommandBarNavBandId = SpineSectionId | 'pin' | 'footer';

type CommandBarNavPageRow = {
  type: 'page';
  id: string;
  label: string;
  href: string;
  icon: SidebarIconComponent;
};

type CommandBarNavSubgroupRow = {
  type: 'subgroup';
  id: string;
  label: string;
  icon: SidebarIconComponent;
};

type CommandBarNavRow = CommandBarNavPageRow | CommandBarNavSubgroupRow;

type CommandBarNavGroup = {
  id: CommandBarNavBandId;
  label: string;
  /** Section glyph for heading tint; null for pin / footer. */
  sectionIcon: SidebarIconComponent | null;
  accent: SpineAccentClasses;
  rows: CommandBarNavRow[];
};

function toPageRow(item: SidebarNavItem): CommandBarNavPageRow {
  return {
    type: 'page',
    id: item.id,
    label: item.label,
    href: item.href,
    icon: item.desktopIcon ?? item.icon,
  };
}

/**
 * Ordered palette groups mirroring MasterNav pin / sections.
 * Empty groups (permission-filtered) are omitted. A leftover
 * `kind: 'bottom'` row still lands in an Account band (none on the default map).
 */
export function buildCommandBarNavGroups(
  permissions?: ReadonlySet<string>,
): CommandBarNavGroup[] {
  // THE ONE FUNNEL.
  // even be any front end routing or links to it"* (operator 2026-09-14).
  const base = getSidebarNavItems({ permissions });
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
      rows: sectionItems.map((i) => toPageRow(i)),
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

/** Filter page rows through the shared nav matcher. */
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
