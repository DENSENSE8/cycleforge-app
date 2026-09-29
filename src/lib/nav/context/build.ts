/**
 * `buildNavContext` — the contextual sidebar's single source of truth, before
 * the rollout gate (`resolveNavContext` in `./resolve` applies it; callers use that).
 *
 * Pure and framework-free: the web shell calls it in-process, the Tauri app
 * gets the same answer from `GET /api/nav/context`. The page registry
 * (`SIDEBAR_PAGE_NAV`) carries icon components; nothing here copies them onto
 * the wire.
 *
 * ONE pipeline, the MasterNav one: org nav (`mergeOrgNav` / `applyOrgNavToPage`)
 * → permissions (`filterPageChildren`) → reachability → the lane gate
 * (`isLaneVisible`, via `getSidebarNavItems`). The old desk tab row skipped the
 * org step; a context built here cannot.
 *
 * Vercel semantics (docs/refactors/sidebar/vercel-sidebar-research.md):
 * - a page with a section panel (≥2 reachable views, or Shipping) resolves to
 *   `section`: its views, and a `‹ <page>` back row that only moves the
 *   sidebar up a level (`mode: 'local'`);
 * - every other page resolves to `top`: the lane map with the page lit, no back;
 * - `view: 'top'` is the frontend's ‹ peek: the lane map with the page's drill
 *   row lit, while the page's own surfaces (search, scan, recents) stay;
 * - nav items carry no counts — only facet groups do, fetched separately.
 */

import {
  APP_SIDEBAR_NAV,
  SPINE_SECTIONS,
  STATION_GROUPS,
  applyChildTarget,
  filterPageChildren,
  getSidebarNavItems,
  getSidebarNavPageId,
  getSidebarPageNav,
  isSidebarPageReachable,
  isSpineMapTopRow,
  spineSectionIdForPage,
  type SidebarChildPage,
  type SidebarNavItem,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import { applyOrgNavToPage, mergeOrgNav, type NavDefinition } from '@/lib/nav/org-nav';
import { LANE_DOORS } from '@/lib/nav/lanes';
import { NAV_FACET_GROUPS, isNavFacetContext, mayReadNavFacet } from '@/lib/nav/facets/contexts';
import { getNavRecentSurface } from '@/lib/nav/recents/surfaces';
import { OUTBOUND_LOCATE, OUTBOUND_LOCATE_PERMISSION } from '@/lib/nav/locate/outbound-params';
import {
  DESK_VIEWS,
  DESK_VIEW_ORDER,
  deskViewHref,
  getDeskView,
  resolveDeskView,
  type DeskView,
} from '@/lib/outbound/desk-views';
import { routeParamsFor } from '@/lib/routing/registry';
import { NAV_PAGE_DECLS, type NavPageDecl, type NavSurfaceDecl } from './pages';
import { NAV_CONTEXT_ROLLOUT } from './rollout';
import {
  NavContextSchema,
  type NavContext,
  type NavItem,
  type NavItemKind,
  type NavRolloutState,
  type NavSearch,
  type NavSection,
} from './schema';

/** The Shipping page — its section comes from `DESK_VIEWS`, not from its children. */
const SHIPPING_PAGE_ID = 'outbound';

/** Search box of every page that declares none: the global identify box. */
const IDENTIFY_SEARCH: NavSearch = {
  scope: 'global',
  placeholder: 'Find anything — scan or type',
  source: 'identify',
};

export interface ResolveNavContextInput {
  pathname: string;
  params: URLSearchParams;
  /** The caller's effective permissions (`ctx.permissions` / `useAuth().user.permissions`). */
  permissions: ReadonlySet<string>;
  /** The org's active `nav_definitions` override, or `null`. */
  orgNav: NavDefinition | null;
  /** Resolved `nav.contextual.<pageId>` overrides; absent = the rollout map. */
  rolloutOverrides?: Readonly<Partial<Record<string, NavRolloutState>>>;
  /** `top` = the ‹ peek: show the lane map instead of the page's section. */
  view?: 'top';
}

interface PipelineInput {
  permissions: ReadonlySet<string>;
  orgNav: NavDefinition | null;
}

/** One section-panel row, before it is stamped active. */
interface SectionRow {
  id: string;
  label: string;
  href: string;
  /** Pathname the row lands on — the view whose params the page advertises. */
  pathname: string;
  /** Group heading (desk-view group / child `group`), if any. */
  group?: { id: string; label: string };
  /** Secondary line, carried to the {@link NavItem}. */
  description?: string;
  /** Item kind; omitted = `link`. */
  kind?: NavItemKind;
  /** Lit state, when it is not "the row IS the active view" (a mode). */
  active?: boolean;
}

/**
 * The page record the sidebar may paint for this caller: org rename / hide /
 * order applied, then the permission funnel. `null` = no door (the page's own
 * gate fails, or every declared child was filtered out).
 */
function pipelinePage(page: SidebarPageNav, input: PipelineInput): SidebarPageNav | null {
  if (page.requires && !input.permissions.has(page.requires)) return null;
  const filtered = filterPageChildren(applyOrgNavToPage(page, input.orgNav), input.permissions);
  return isSidebarPageReachable(filtered) ? filtered : null;
}

function hrefOf(target: { pathname: string; search: string }): string {
  return target.search ? `${target.pathname}?${target.search}` : target.pathname;
}

/** Shipping rows: each reachable child expands to its `DESK_VIEWS` in paint order. */
function shippingRows(page: SidebarPageNav): SectionRow[] {
  const rows: SectionRow[] = [];
  for (const child of page.children ?? []) {
    const views: DeskView[] = DESK_VIEW_ORDER.map(getDeskView).filter((v) => v.navChild === child.id);
    const group = views.length > 1 ? { id: child.id, label: child.label } : undefined;
    for (const view of views) {
      rows.push({
        id: view.id,
        // A lone view wears its child's (possibly org-renamed) label.
        label: group ? view.label : child.label,
        href: deskViewHref(view.id),
        pathname: view.pathname,
        group,
      });
    }
  }
  return rows;
}

function childRows(page: SidebarPageNav): SectionRow[] {
  const bare = { pathname: new URL(page.href, 'http://nav.local').pathname, params: new URLSearchParams() };
  return (page.children ?? []).map((child: SidebarChildPage) => {
    const target = applyChildTarget(bare, child.to());
    return {
      id: child.id,
      label: child.label,
      href: hrefOf(target),
      pathname: target.pathname,
      group: child.group ? { id: child.group, label: child.group } : undefined,
    };
  });
}

function sectionRows(page: SidebarPageNav): SectionRow[] {
  return page.id === SHIPPING_PAGE_ID ? shippingRows(page) : childRows(page);
}

/**
 * A page draws a section panel when it has ≥2 views to switch between
 * (Shipping: any), or when its recents list is its panel (`recentsPanel`, Chat).
 */
function hasSectionPanel(page: SidebarPageNav, rows: readonly SectionRow[]): boolean {
  if (NAV_PAGE_DECLS[page.id]?.recentsPanel) return true;
  return page.id === SHIPPING_PAGE_ID ? rows.length > 0 : rows.length >= 2;
}

function activeRowId(page: SidebarPageNav, pathname: string, params: URLSearchParams): string | null {
  if (page.id === SHIPPING_PAGE_ID) return resolveDeskView(pathname, params);
  return page.resolveChild?.({ pathname, params }) ?? null;
}

/**
 * A page's OWN modes (`NavPageDecl.modes`), as the same `.modes` section a
 * door lane's modes are (`NavModeSwitcher` paints both): every ungrouped
 * child is a mode, then the current mode's grouped children as its views,
 * ungrouped, so the view switcher paints them under the card. No "all" mode
 * (owner 2026-09-29): a mode's href is its first view (only the ones this
 * caller can open), and a URL inside no mode reads as the first one. A mode's
 * secondary line names its views.
 */
function pageModeRows(decl: NonNullable<NavPageDecl['modes']>, rows: readonly SectionRow[], activeId: string | null): SectionRow[] {
  const group = { id: 'modes', label: decl.label };
  const active = rows.find((row) => row.id === activeId);
  const modeId = active ? (active.group?.id ?? active.id) : null;
  const viewsOf = (id: string) => rows.filter((row) => row.group?.id === id);
  const children = rows.filter((row) => !row.group);
  const mode = children.find((row) => row.id === modeId) ?? children[0];
  const modes = children.map((row): SectionRow => {
    const views = viewsOf(row.id);
    const first = views[0];
    return {
      ...row,
      group,
      active: row === mode,
      ...(first ? { href: first.href, pathname: first.pathname, description: views.map((view) => view.label).join(' · ') } : {}),
    };
  });
  const views = mode ? viewsOf(mode.id).map((row) => ({ ...row, group: undefined })) : [];
  return [...modes, ...views];
}

/**
 * Consecutive rows sharing a group become one labelled section; ungrouped runs
 * share an unlabelled one. A heading over a single row would only repeat it,
 * so a group of one is painted unlabelled.
 */
function toSections(pageId: string, rows: readonly SectionRow[], activeId: string | null): NavSection[] {
  const runs: Array<{ group?: SectionRow['group']; section: NavSection }> = [];
  for (const row of rows) {
    const item: NavItem = { id: row.id, label: row.label, href: row.href, active: row.active ?? row.id === activeId, kind: row.kind ?? 'link', ...(row.description ? { description: row.description } : {}) };
    const last = runs.at(-1);
    if (last && last.group?.id === row.group?.id) {
      last.section.items.push(item);
      continue;
    }
    runs.push({ group: row.group, section: { id: `${pageId}.${row.group?.id ?? row.id}`, items: [item] } });
  }
  return runs.map(({ group, section }) => (group && section.items.length > 1 ? { ...section, label: group.label } : section));
}

/**
 * The top-level lane map: the spine's top rows, then each lane in
 * `SPINE_SECTIONS` order. A lane heading only sits over two or more rows
 * (one row under its own lane name would break the nav-name law).
 */
function laneMap(input: PipelineInput, activePageId: string): NavSection[] {
  const rows = mergeOrgNav(getSidebarNavItems({ permissions: input.permissions }), input.orgNav);
  const toItem = (row: SidebarNavItem): NavItem | null => {
    const registered = getSidebarPageNav(row.id);
    let kind: NavItem['kind'] = 'link';
    if (registered) {
      const page = pipelinePage({ ...registered, label: row.label }, input);
      if (!page) return null;
      kind = hasSectionPanel(page, sectionRows(page)) ? 'drill' : 'link';
    }
    return { id: row.id, label: row.label, href: row.href, active: row.id === activePageId, kind };
  };

  const sections: NavSection[] = [];
  const topItems = rows.filter(isSpineMapTopRow).map(toItem).filter((item): item is NavItem => item !== null);
  if (topItems.length > 0) sections.push({ id: 'top', items: topItems });
  const orderableTopItems = rows
    .filter((row) => row.kind === 'top' && row.spineOrderable === true)
    .map(toItem)
    .filter((item): item is NavItem => item !== null);
  // Scan Stations sit at the very bottom. Reports closes the five business
  // lanes before any secondary/parked lane, matching the visible sales flow.
  const isStationLane = (id: string) => STATION_GROUPS.some((group) => group.id === id);
  const businessLaneIds = new Set(['sales', 'inbound', 'fulfillment', 'inventory', 'catalog']);
  const appendLane = (lane: (typeof SPINE_SECTIONS)[number]) => {
    const items = rows
      .filter((row) => spineSectionIdForPage(row) === lane.id)
      .map(toItem)
      .filter((item): item is NavItem => item !== null);
    if (items.length === 0) return;
    // A lane door is ONE row: the lane's name, opening its landing page, lit
    // while you are on any page of the lane.
    const door = items.find((item) => item.id === LANE_DOORS[lane.id]);
    if (door) {
      const active = items.some((item) => item.active);
      sections.push({ id: lane.id, items: [{ ...door, label: lane.label, active }] });
      return;
    }
    sections.push(items.length > 1 ? { id: lane.id, label: lane.label, items } : { id: lane.id, items });
  };
  SPINE_SECTIONS.filter((lane) => businessLaneIds.has(lane.id)).forEach(appendLane);
  if (orderableTopItems.length > 0) sections.push({ id: 'ordered-top', items: orderableTopItems });
  SPINE_SECTIONS.filter(
    (lane) => !businessLaneIds.has(lane.id) && !isStationLane(lane.id),
  ).forEach(appendLane);
  SPINE_SECTIONS.filter((lane) => isStationLane(lane.id)).forEach(appendLane);
  return sections;
}

/**
 * The door lane a page belongs to, else null. EVERY page of a lane that has a
 * door (Shipping · FBA · Labels & docs; Deliveries · Sourcing) wears the
 * lane's name on its `‹` row and leads its panel with the lane's MODES — the
 * same parent tier on every mode, never a `‹ <Page>` back row (operator
 * 2026-09-28). Derived from lane membership, so a new page in the lane gets it
 * with no declaration.
 */
function modeLaneOf(page: SidebarPageNav | null): (typeof SPINE_SECTIONS)[number] | null {
  if (!page) return null;
  const laneId = spineSectionIdForPage(page);
  if (!laneId || !LANE_DOORS[laneId]) return null;
  return SPINE_SECTIONS.find((lane) => lane.id === laneId) ?? null;
}

/**
 * A door lane's pages as its MODES — the door page first (Shipping), then the
 * rest in registry order (FBA, Labels & docs), whichever mode is current. One
 * section, id `<page>.<lane>.modes`, painted as the mode switcher under
 * `‹ <Lane>`.
 */
function laneModeRows(lane: (typeof SPINE_SECTIONS)[number], input: PipelineInput): SectionRow[] {
  const group = { id: `${lane.id}.modes`, label: 'Mode' };
  const toRow = (row: { id: string; label: string; href: string; description?: string }): SectionRow => ({
    id: row.id,
    label: row.label,
    href: row.href,
    pathname: new URL(row.href, 'http://nav.local').pathname,
    group,
    // The lane's current mode is the PAGE (`NavModeSwitcher`'s `currentPageId`), never a view id.
    active: false,
    ...(row.description ? { description: row.description } : {}),
  });
  const doorId = LANE_DOORS[lane.id];
  const pages = mergeOrgNav(getSidebarNavItems({ permissions: input.permissions }), input.orgNav).filter(
    (row) => spineSectionIdForPage(row) === lane.id,
  );
  const ordered = [...pages.filter((row) => row.id === doorId), ...pages.filter((row) => row.id !== doorId)];
  // One page is no choice: a lane with a single reachable page has no switcher.
  return ordered.length > 1 ? ordered.map(toRow) : [];
}

/** Every key the routes' param specs declare (owned or carried) — what hygiene keeps. */
export function declaredRouteParams(pathnames: Iterable<string>): string[] {
  const keys = new Set<string>();
  for (const pathname of pathnames) {
    const spec = routeParamsFor(pathname);
    if (!spec) continue;
    for (const key of Object.keys(spec.owns)) keys.add(key);
    for (const key of spec.carries ?? []) keys.add(key);
  }
  return [...keys];
}

function pageLabel(pageId: string, page: SidebarPageNav | null): string {
  if (page) return page.label;
  const registered = getSidebarPageNav(pageId) ?? APP_SIDEBAR_NAV.find((item) => item.id === pageId);
  if (registered) return registered.label;
  const words = pageId.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function surfaceFor(pageId: string, activeId: string | null): NavSurfaceDecl {
  const { items, ...pageDecl } = NAV_PAGE_DECLS[pageId] ?? {};
  return { ...pageDecl, ...(activeId ? items?.[activeId] : undefined) };
}

function searchFor(
  pageId: string,
  activeId: string | null,
  decl: NavSurfaceDecl,
  permissions: ReadonlySet<string>,
): NavSearch {
  const scope = activeId ? `${pageId}.${activeId}` : pageId;
  const deskView = DESK_VIEWS.find((view) => pageId === SHIPPING_PAGE_ID && view.id === activeId);
  // The Shipping box is the in-memory desk store, keyed by the view's pathname
  // (`useDeskSearch`) — it writes no URL param, so none is advertised. A pasted
  // list is located across the desk's views (`GET /api/nav/locate`), offered
  // only to a caller who can read the desk's lists.
  if (deskView) {
    return {
      scope,
      placeholder: deskView.searchScope,
      source: 'desk-store',
      ...(permissions.has(OUTBOUND_LOCATE_PERMISSION) ? { locate: { ...OUTBOUND_LOCATE } } : {}),
    };
  }
  return decl.search ? { scope, ...decl.search } : IDENTIFY_SEARCH;
}

export function buildNavContext(input: ResolveNavContextInput): NavContext {
  const { pathname, params, permissions, orgNav } = input;
  const pipeline: PipelineInput = { permissions, orgNav };
  const pageId = getSidebarNavPageId(pathname, params);
  const registered = getSidebarPageNav(pageId);
  const page = registered ? pipelinePage(registered, pipeline) : null;

  const rows = page ? sectionRows(page) : [];
  // A view the caller has no door to lights nothing (and lends no surfaces).
  const resolvedActive = page ? activeRowId(page, pathname, params) : null;
  const activeId = rows.some((row) => row.id === resolvedActive) ? resolvedActive : null;
  const sectionScope = page !== null && hasSectionPanel(page, rows) && input.view !== 'top';
  // Every page of a door lane wears the lane's name (the map shows no page
  // rows for that lane) and its panel leads with the lane's modes.
  const modeLane = modeLaneOf(page);
  const label = modeLane ? modeLane.label : pageLabel(pageId, page);
  // A page with its own modes paints them as the card, and the current mode's views under it.
  const modeDecl = page ? NAV_PAGE_DECLS[pageId]?.modes : undefined;
  const panelRows = modeDecl ? pageModeRows(modeDecl, rows, activeId) : modeLane && page ? [...laneModeRows(modeLane, pipeline), ...rows] : rows;

  const viewPathnames = new Set<string>(rows.map((row) => row.pathname));
  if (registered) viewPathnames.add(new URL(registered.href, 'http://nav.local').pathname);
  viewPathnames.add(pathname);

  const decl = surfaceFor(pageId, activeId);
  const facetContext = activeId ? `${pageId}.${activeId}` : pageId;
  const actions = (decl.actions ?? [])
    .filter((entry) => !entry.requires || permissions.has(entry.requires))
    .map((entry) => entry.action);

  const context: NavContext = {
    scope: sectionScope ? 'section' : 'top',
    page: { id: pageId, label },
    back: sectionScope ? { label, mode: 'local' } : null,
    search: searchFor(pageId, activeId, decl, permissions),
    sections: sectionScope ? toSections(pageId, panelRows, activeId) : laneMap(pipeline, pageId),
    params: declaredRouteParams(viewPathnames),
    // The REQUESTED switch; `resolveNavContext` clamps it against parity.
    rollout: input.rolloutOverrides?.[pageId] ?? NAV_CONTEXT_ROLLOUT[pageId] ?? 'legacy',
  };
  // Facet groups and recents are offered only when the caller can read the
  // endpoint behind them (the facets / recents registries own the gates).
  if (isNavFacetContext(facetContext) && mayReadNavFacet(permissions, facetContext)) {
    context.filters = { facetContext, groups: NAV_FACET_GROUPS[facetContext].map((group) => ({ ...group })) };
  }
  if (decl.controls) {
    // A deep copy — the declaration is shared module state, the context goes on the wire.
    context.controls = structuredClone(decl.controls);
  }
  const recents = decl.recents ? getNavRecentSurface(decl.recents) : null;
  if (recents && (!recents.permission || permissions.has(recents.permission))) {
    context.recents = {
      endpoint: recents.endpoint,
      surface: recents.id,
      ...(recents.find ? { find: true as const } : {}),
      ...(recents.paged ? { paged: true as const } : {}),
      ...(recents.rowActions
        ? { rowActions: { endpoint: recents.rowActions.endpoint, verbs: [...recents.rowActions.verbs] } }
        : {}),
      ...(recents.chords ? { chords: true as const } : {}),
    };
  }
  if (decl.savedViews) {
    context.savedViews = { storageKey: decl.savedViews.storageKey, paramKeys: [...decl.savedViews.paramKeys] };
  }
  if (actions.length > 0) context.actions = actions;
  if (actions.length > 0 && decl.actionsPlacement) context.actionsPlacement = decl.actionsPlacement;
  if (decl.scanInput) context.scanInput = { ...decl.scanInput };
  if (sectionScope && NAV_PAGE_DECLS[pageId]?.viewKeys) context.viewKeys = true;
  return NavContextSchema.parse(context);
}
