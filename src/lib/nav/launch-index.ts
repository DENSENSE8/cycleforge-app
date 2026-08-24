/**
 * The launch index — ONE searchable master list of everything openable.
 *
 * This is the data behind the left rail's "+". It is deliberately **a new
 * mount of existing code, not new code**: the page bands come out of
 * {@link buildCommandBarNavGroups} verbatim (the same permission filter, the
 * same reachability rule, the same Pin → sections → Account order the spine
 * and ⌘K already use), and the ranking comes out of {@link searchNav}, the one
 * nav matcher. What this module adds is the three bands that were never
 * reachable by typing because they were never destinations: **sessions**,
 * **tables** and **tools**.
 *
 * ## Why one index instead of three menus
 *
 * "Where do I start an Unbox?" and "where do I open the Orders grid?" are the
 * same question with different nouns, and until now they had different answers
 * — a page list, and nothing. Splitting the launcher by kind would make the
 * operator classify the thing before they can look for it, which is precisely
 * the knowledge a launcher exists to not require. So: one index, banded by
 * category for browsing, flat-ranked while typing.
 *
 * ## `kind` is optional, and its absence means "page"
 *
 * See {@link NavLaunchKind}. Every row this module inherits from the palette
 * leaves it absent and keeps navigating; the rows added here set it, and the
 * rail turns those into `openTab({ kind, ref })`. No existing call site of
 * `buildCommandBarNavGroups` (CommandBar) or `buildNavDestinations`
 * (SidebarNavList) changed.
 *
 * ## On permissions
 *
 * Session rows are filtered by `SurfaceDefinition.permission` when a permission
 * set is supplied — the SAME thing `buildCommandBarNavGroups` already does to
 * page rows, reading a field that already exists on a registry that already
 * had it. It decides what is LISTED, not what is allowed: the boundary is
 * `withAuth` on the surface's API routes. Nothing here puts a permission on a
 * tab, session or tool descriptor, and nothing should.
 */

import {
  buildCommandBarNavGroups,
  type CommandBarNavBandId,
  type CommandBarNavGroup,
} from '@/lib/nav/command-bar-nav-groups';
import type { NavLaunchKind, NavLaunchTarget } from '@/lib/nav/nav-destinations';
import { searchNav, type NavMatchRange } from '@/lib/nav/nav-search';
import { spineAccentFor, type SpineAccentClasses } from '@/lib/nav/spine-section-accent';
import {
  RECEIVING_NAV_ICONS,
  SHIPPING_NAV_ICONS,
  STATION_PAGE_ICONS,
  TECH_NAV_ICONS,
} from '@/lib/nav/station-nav-icons';
import { Database, History, ScanBarcode, TicketHelp, Tool } from '@/lib/icons';
import {
  getSidebarRouteKey,
  type SidebarIconComponent,
} from '@/lib/sidebar-navigation';
import { listSurfaces, type SurfaceKey } from '@/lib/stations/surface-keys';
import { TABLE_COLUMNS, type TableId } from '@/lib/tables/table-columns';
import type { TabParams } from '@/lib/workspace/types';

/** Bands: the spine's own, then one per non-page kind. */
export type LaunchBandId = CommandBarNavBandId | 'session' | 'table' | 'tool';

/**
 * A selectable row — the only row shape in the index.
 *
 * The palette's `subgroup` chrome (Receiving · Walk-In) is deliberately NOT
 * carried over. It is browse-time hierarchy for a spine that renders a tree;
 * this index is a flat, ranked list inside each band, so a heading here would
 * be a category with no children to disclose. `filterCommandBarNavGroups`
 * already drops the same rows the moment its own list goes flat.
 */
export interface LaunchRow extends NavLaunchTarget {
  /** Unique across the whole index — the popover's React key and cursor id. */
  id: string;
  label: string;
  /** Second line: the route for a page, the ref for everything else. */
  detail: string;
  icon: SidebarIconComponent;
  /** Router target. Page rows only; absent means this row opens a tab. */
  href?: string;
  /**
   * Seed params for a non-page launch. Flat JSON scalars, because that is the
   * whole of {@link TabParams} — the store's shallow-merge contract is what
   * makes a nested bag lose half of itself when two panes write at once.
   */
  params?: TabParams;
  /** Searched, never highlighted (route fragments, aliases, the band name). */
  keywords: string[];
}

export interface LaunchGroup {
  id: LaunchBandId;
  label: string;
  /** Band glyph for the heading tint; null for bands with no section identity. */
  sectionIcon: SidebarIconComponent | null;
  accent: SpineAccentClasses;
  rows: LaunchRow[];
}

/**
 * A tool the index should list. Phase 5 owns the tool registry
 * (`registerTool({ toolKey, title, icon, group, load, … })`); until it exists
 * this parameter is how tools reach the launcher, so wiring the registry in
 * later is one call site and not a change to this module.
 */
export interface LaunchToolEntry {
  toolKey: string;
  label: string;
  icon: SidebarIconComponent;
  keywords?: readonly string[];
}

/**
 * Glyphs for the session band, composed from the station icon registry rather
 * than picked fresh — a session and the bench it runs on must not disagree
 * about what they look like. `Record<SurfaceKey, …>` so a new surface key
 * cannot ship without answering.
 */
export const SESSION_LAUNCH_ICONS: Record<SurfaceKey, SidebarIconComponent> = {
  unbox: RECEIVING_NAV_ICONS.receive,
  triage: RECEIVING_NAV_ICONS.triage,
  incoming: RECEIVING_NAV_ICONS.incoming,
  pickup: RECEIVING_NAV_ICONS.pickup,
  repair: RECEIVING_NAV_ICONS.repair,
  history: History,
  pack: STATION_PAGE_ICONS.packer,
  test: TECH_NAV_ICONS.testing,
  outbound: SHIPPING_NAV_ICONS['scan-out'],
  support: TicketHelp,
};

/**
 * Every table gets the same glyph, on purpose. A table's identity is its NAME
 * — twenty-five hand-picked glyphs would be a second icon vocabulary to keep
 * in step with the pages they duplicate, and at this row height a distinct
 * glyph per grid buys recognition the label already provides.
 */
export const LAUNCH_TABLE_ICON: SidebarIconComponent = Database;

/**
 * `'tracking-exceptions'` → `'Tracking exceptions'`.
 *
 * Table ids ARE their labels — every one of them is already the operator's word
 * for the grid, hyphenated. A hand-written `Record<TableId, string>` beside them
 * would be twenty-five strings to keep in step with twenty-five strings, and the
 * first thing to drift when a table is added. Shared with the tab strip so a
 * table's tab and its launcher row cannot disagree about its name.
 */
export function humanizeLaunchRef(ref: string): string {
  const words = ref.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The one derived fact a session row carries: which rail panel it shows while
 * focused. Resolved through `getSidebarRouteKey` — the existing pathname →
 * route-key SoT — so the binding cannot drift from what the route itself would
 * have mounted. It rides in `params` rather than on a new descriptor field
 * because that is exactly what params are for: this tab's own view state, flat
 * and serializable, readable by the canvas host in Phase 6 without a codec.
 *
 * `panel-registry`'s `isPanelId` is what VALIDATES it, at the point of mount.
 * Doing the check here would drag the 19-panel client module into every
 * consumer of the nav layer for one string comparison.
 */
function sessionParams(route: string): TabParams {
  return { panel: getSidebarRouteKey(route) };
}

function pageBands(permissions?: ReadonlySet<string>): LaunchGroup[] {
  return buildCommandBarNavGroups(permissions).map(
    (group: CommandBarNavGroup): LaunchGroup => ({
      id: group.id,
      label: group.label,
      sectionIcon: group.sectionIcon,
      accent: group.accent,
      rows: group.rows.flatMap((row): LaunchRow[] =>
        row.type === 'subgroup'
          ? []
          : [
              {
                id: `page:${row.id}`,
                label: row.label,
                detail: row.href,
                icon: row.icon,
                href: row.href,
                // The href is searchable but can never outrank a label — the
                // KEYWORD_PENALTY in `nav-search` is what buys that, and it is
                // why a URL fragment belongs here rather than in `label`.
                keywords: [row.href, group.label],
              },
            ],
      ),
    }),
  );
}

function sessionBand(permissions?: ReadonlySet<string>): LaunchGroup | null {
  const rows: LaunchRow[] = [];
  for (const surface of listSurfaces()) {
    if (permissions && !permissions.has(surface.permission)) continue;
    rows.push({
      id: `session:${surface.key}`,
      label: surface.label,
      detail: surface.route,
      icon: SESSION_LAUNCH_ICONS[surface.key],
      kind: 'session',
      ref: surface.key,
      params: sessionParams(surface.route),
      keywords: [
        surface.route,
        surface.key,
        // A scan session answers to the word "scan" and to its own scan type,
        // so "scan unbox" and "arrival" both land — the scan vocabulary is what
        // an operator says out loud, and it is not in any label.
        surface.session.kind === 'scan' ? `scan ${surface.session.scanType}` : 'task',
      ],
    });
  }
  if (rows.length === 0) return null;
  return {
    id: 'session',
    label: 'Sessions',
    sectionIcon: ScanBarcode,
    accent: spineAccentFor(null),
    rows,
  };
}

function tableBand(): LaunchGroup {
  const rows: LaunchRow[] = (Object.keys(TABLE_COLUMNS) as TableId[]).map((id) => ({
    id: `table:${id}`,
    label: humanizeLaunchRef(id),
    detail: id,
    icon: LAUNCH_TABLE_ICON,
    kind: 'table',
    ref: id,
    keywords: [id, 'table', 'grid', 'spreadsheet'],
  }));
  return {
    id: 'table',
    label: 'Tables',
    sectionIcon: LAUNCH_TABLE_ICON,
    accent: spineAccentFor(null),
    rows,
  };
}

function toolBand(tools: readonly LaunchToolEntry[]): LaunchGroup | null {
  if (tools.length === 0) return null;
  return {
    id: 'tool',
    label: 'Tools',
    sectionIcon: Tool,
    accent: spineAccentFor(null),
    rows: tools.map((tool) => ({
      id: `tool:${tool.toolKey}`,
      label: tool.label,
      detail: tool.toolKey,
      icon: tool.icon,
      kind: 'tool',
      ref: tool.toolKey,
      keywords: [tool.toolKey, 'tool', ...(tool.keywords ?? [])],
    })),
  };
}

/**
 * The whole index, in browse order: the spine's page bands first (the map the
 * operator already knows), then the three kinds that only exist inside the
 * shell. Empty bands are omitted rather than rendered as a heading over
 * nothing.
 */
export function buildLaunchIndex(
  opts: {
    permissions?: ReadonlySet<string>;
    /** Phase 5's tool registry, once it exists. Empty until then. */
    tools?: readonly LaunchToolEntry[];
  } = {},
): LaunchGroup[] {
  const bands: LaunchGroup[] = [...pageBands(opts.permissions)];
  const sessions = sessionBand(opts.permissions);
  if (sessions) bands.push(sessions);
  bands.push(tableBand());
  const tools = toolBand(opts.tools ?? []);
  if (tools) bands.push(tools);
  return bands;
}

/** A ranked row plus the label offsets that justified it. */
export interface LaunchHit {
  row: LaunchRow;
  /** Spans to mark in the label. Empty when the match came from a keyword. */
  ranges: readonly NavMatchRange[];
}

export interface LaunchResultGroup {
  id: LaunchBandId;
  label: string;
  sectionIcon: SidebarIconComponent | null;
  accent: SpineAccentClasses;
  hits: LaunchHit[];
}

/**
 * Rank the index against a query, WITHIN each band.
 *
 * Bands are never re-sorted by best hit, for the reason
 * `filterCommandBarNavGroups` gives: the bands are the spine's own categories,
 * and reordering them under the cursor while the operator types makes the row
 * they were reaching for move. Cross-band ranking is the flat-list job, and the
 * flat list is the spine's.
 *
 * Unlike the palette's filter, this KEEPS the match ranges. A launcher whose
 * whole job is typing should mark the characters that answered — the palette
 * drops them only because its row primitive has nowhere to put them.
 */
export function filterLaunchIndex(
  groups: readonly LaunchGroup[],
  query: string,
): LaunchResultGroup[] {
  const searching = query.trim().length > 0;

  return groups.flatMap((group) => {
    const hits: LaunchHit[] = searching
      ? searchNav(group.rows, query).map(({ item, match }) => ({
          row: item,
          ranges: match.ranges,
        }))
      : group.rows.map((row) => ({ row, ranges: [] as readonly NavMatchRange[] }));

    if (hits.length === 0) return [];
    return [
      {
        id: group.id,
        label: group.label,
        sectionIcon: group.sectionIcon,
        accent: group.accent,
        hits,
      },
    ];
  });
}

/**
 * A row that opens a TAB rather than pushing a route.
 *
 * The two facts a tab launch needs — a non-page `kind` and a `ref` — are both
 * optional on the row type (because a page has neither), so without this guard
 * every consumer re-derives the same pair of checks and TypeScript still hands
 * them `string | undefined`. Narrowing it once here is what lets
 * `launchDestination` be four lines.
 */
export function isTabLaunch(
  row: LaunchRow,
): row is LaunchRow & { kind: Exclude<NavLaunchKind, 'page'>; ref: string } {
  return row.kind != null && row.kind !== 'page' && typeof row.ref === 'string';
}

/** Flatten ranked bands into cursor order — what ↑/↓ walks. */
export function launchCursorRows(
  groups: readonly LaunchResultGroup[],
): LaunchRow[] {
  return groups.flatMap((group) => group.hits.map((hit) => hit.row));
}
