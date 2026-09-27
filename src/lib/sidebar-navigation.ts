import {
  Activity,
  AlertCircle,
  Barcode,
  BarChart3,
  ChartPie,
  Images,
  AlertTriangle,
  Check,
  Clipboard,
  Cpu,
  ClipboardList,
  Clock,
  FileText,
  History,
  Inbox,
  Layers,
  LayoutDashboard,
  Link2,
  ListChecks,
  MessageSquare,
  Monitor,
  Package,
  PackageCheck,
  ScanBarcode,
  Search,
  Settings,
  SalesPrice,
  SalesModeCounter,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Tags,
  TrendingUp,
  User,
  Workflow,
  Zap,
  Warehouse,
  ShelvingUnit,
  StationWalkIn,
  Phone,
  Voicemail,
} from '@/components/Icons';
import {
  DASHBOARD_REPAIRS_MODE,
  DASHBOARD_SALES_MODE,
  DASHBOARD_SALES_PERMISSION,
} from '@/lib/dashboard/dashboard-domains';
import {
  RECEIVING_NAV_ICONS,
  SHIPPING_NAV_ICONS,
  STATION_PAGE_ICONS,
  TECH_NAV_ICONS,
} from '@/lib/nav/station-nav-icons';
import { domainLane, isLaneVisible, type DomainGroupId } from '@/lib/nav/lanes';
import { isTabParked } from '@/lib/nav/parked-tabs';
import { parseInboundLane } from '@/lib/receiving/inbound-lane';
import { parseProductsView } from '@/components/products/products-view';
import { OUTBOUND_MODE_PATHS, outboundModeFromPath } from '@/components/outbound/outbound-sidebar-shared';
import { SHIPPING_EXCEPTIONS_PATH, SHIPPING_LABEL_INTAKE_PATH, SHIPPING_ORDERS_PATH, SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { DESK_QUEUE_PARAM } from '@/lib/outbound/desk-views';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';

export type SidebarRouteKey =
  | 'home'
  | 'dashboard'
  | 'operations'
  | 'ops-photos'
  | 'studio'
  | 'fba'
  | 'receiving'
  | 'walk-in'
  | 'repair'
  | 'replenish'
  | 'inventory'
  | 'products'
  | 'warehouse'
  | 'sourcing'
  | 'tech'
  | 'packer'
  | 'review'
  | 'outbound'
  | 'support'
  | 'ai-chat'
  | 'audit-log'
  | 'settings'
  | 'search'
  | 'unknown';

export type SidebarIconComponent = (props: { className?: string }) => JSX.Element;

/** Stations category under the spine (`SidebarNavList` + guard). */
export type StationGroupId = 'floor';

/**
 * Scan Stations registry. Spine list imports this — never hard-code the label
 * in the render path. Render order on the spine is {@link SPINE_SECTIONS}.
 */
export const STATION_GROUPS = [
  { id: 'floor', label: 'Scan Stations', icon: ScanBarcode },
] as const satisfies ReadonlyArray<{
  id: StationGroupId;
  label: string;
  icon: SidebarIconComponent;
}>;

/**
 * MasterNav parent for pointer desks — the Scan Stations twin, not a domain.
 *
 * Wave 2 paints this as an in-place collapsible on the spine.
 */
export type DeskGroupId = 'desks';

export const DESK_GROUPS = [
  { id: 'desks', label: 'Workspaces', icon: LayoutDashboard },
] as const satisfies ReadonlyArray<{
  id: DeskGroupId;
  label: string;
  icon: SidebarIconComponent;
}>;

/** Main category ids under the spine — Operations, then Studio at the end of the map. */
export type MainGroupId = 'monitor' | 'studio';

/** Spine list imports this — never hard-code the label in the render path. */
export const MAIN_GROUPS = [
  { id: 'monitor', label: 'Monitor', icon: ChartPie },
  { id: 'studio', label: 'Automations', icon: Workflow },
] as const satisfies ReadonlyArray<{
  id: MainGroupId;
  label: string;
  icon: SidebarIconComponent;
}>;

/** Optional peer tags on floor benches (Arrival · Unbox / Local Pickup · Repair Service / Quality Control · Ready to Pack). */
export type StationSubgroupId = 'receiving' | 'walk-in' | 'testing';

export const STATION_SUBGROUPS = [
  { id: 'receiving', label: 'Receiving', icon: STATION_PAGE_ICONS.receiving },
  { id: 'walk-in', label: 'Walk-In', icon: StationWalkIn },
  { id: 'testing', label: 'Testing', icon: STATION_PAGE_ICONS.tech },
] as const satisfies ReadonlyArray<{
  id: StationSubgroupId;
  label: string;
  icon: SidebarIconComponent;
}>;

/** Look up a station subgroup header (label + icon) by id. */
export function getStationSubgroupDef(
  id: StationSubgroupId | undefined,
): (typeof STATION_SUBGROUPS)[number] | null {
  if (!id) return null;
  return STATION_SUBGROUPS.find((g) => g.id === id) ?? null;
}

/** `stationSubgroup` on a station page, else undefined (domains / modeless). */
export function stationSubgroupOfPage(
  page: { kind?: string; stationSubgroup?: StationSubgroupId } | null | undefined,
): StationSubgroupId | undefined {
  if (page?.kind !== 'station') return undefined;
  return page.stationSubgroup;
}

/** The lane registry moved to `@/lib/nav/lanes` on 2026-09-14 so the `/m` drawer can read a lane's label and PARENT icon without importing… */

/** Spine sections — Scan Stations, then the lane order the operator reads top-to-bottom: */
export const SPINE_SECTIONS = [
  ...STATION_GROUPS, // Scan Stations
  domainLane('inbound'),
  domainLane('fulfillment'), // faced "Outbound"
  domainLane('inventory'),
  domainLane('catalog'), // faced "Products"
  domainLane('sales'),
  domainLane('support'),
  MAIN_GROUPS[0], // Operations (monitor)
  MAIN_GROUPS[1], // Automations
] as const;

export type SpineSectionId = (typeof SPINE_SECTIONS)[number]['id'];

/** Resolve which spine section a page belongs to (null = top pin / parked / unknown). */
export function spineSectionIdForPage(
  page:
    | {
        kind?: 'main' | 'station' | 'domain' | 'top' | 'bottom';
        mainGroup?: MainGroupId;
        stationGroup?: StationGroupId;
        domainGroup?: DomainGroupId;
      }
    | null
    | undefined,
): SpineSectionId | null {
  if (!page) return null;
  if (page.kind === 'main') return page.mainGroup ?? null;
  if (page.kind === 'station') return page.stationGroup ?? null;
  if (page.kind === 'domain') return page.domainGroup ?? null;
  return null;
}

type SidebarNavItemFields = {
  id: string;
  label: string;
  href: string;
  icon: SidebarIconComponent;
  /** Optional desktop-only icon override (master nav on lg+). */
  desktopIcon?: SidebarIconComponent;
  /**
   * Permission required to see this item. If omitted, the item is visible
   * to anyone signed in (and to unauthenticated callers during rollout —
   * see filtering rules in getSidebarNavItems).
   */
  requires?: string;
  /**
   * Extra terms that should find this page in ⌘K, beyond its label and href.
   * Not a synonym dump: every entry is a word someone would really type.
   */
  keywords?: string[];
  /** `kind: 'top'` only. */
  spineBand?: boolean;
  /**
   * Render this L1 as a single flat map row even though it declares `children`.
   * Children stay live for ⌘K, the header Mode switcher and deep links.
   */
  spineFlat?: boolean;
  /**
   * Hide unless the active organization is a sandbox tenant.
   */
  sandboxOnly?: boolean;
};

/** Flat spine row. */
export type SidebarNavItem =
  | (SidebarNavItemFields & { kind: 'top' })
  | (SidebarNavItemFields & { kind?: 'bottom' })
  | (SidebarNavItemFields & { kind: 'main'; mainGroup: MainGroupId })
  | (SidebarNavItemFields & {
      kind: 'station';
      stationGroup: StationGroupId;
      stationSubgroup?: StationSubgroupId;
    })
  | (SidebarNavItemFields & { kind: 'domain'; domainGroup: DomainGroupId });

const MOBILE_RESTRICTED_SIDEBAR_IDS = new Set<SidebarRouteKey>([
  'operations',
  'studio',
  'support',
  'audit-log',
  // Review station is desktop-only (packer capture stays on /m/pack). Plan §4d.
  'review',
]);

const MOBILE_ALLOWED_PREFIXES: ReadonlyArray<string> = [
  '/m',
  '/signin',
  '/kiosk', // customer-intake tablet — a tablet-first surface, so touch/mobile devices must reach it (never bounce to /m/home)
  '/receiving',
  '/unbox',
  '/triage',
  '/incoming',
  '/pickup',
  '/repair',
  '/pack',
  '/packer',
  '/shipping',
  '/outbound',
  '/test',
  '/tech',
  '/01',
  '/414',
];

export function isMobileAllowedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return MOBILE_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Dogfood prod surface (stations + shipping + inventory + warehouse + thin support). */
export const APP_SIDEBAR_NAV: SidebarNavItem[] = [
  // Top map rows — Chat → Daily → Media Library. Chat leads the page map and
  // the ⌘K pin (operator 2026-09-27); `/ai-chat` → SessionSurface, the ONE
  // assistant door.
  { id: 'ai-chat',           label: 'Chat',           href: '/ai-chat',            icon: MessageSquare,   kind: 'top', requires: 'assistant.chat' },
  { id: 'home',              label: 'Daily',           href: '/',                   icon: ListChecks,      kind: 'top' },
  { id: 'search',            label: 'Search',         href: '/search',             icon: Search,          kind: 'top', spineBand: false },
  { id: 'ops-photos',        label: 'Media Library',  href: '/ops/photos',         icon: Images,          kind: 'top', requires: 'photos.view', keywords: ['photos', 'photo library', 'images', 'assets', 'gallery'] },
  // Plans — live master-plan console (Home forge). Same landing as `/forge`.
  { id: 'plans-live',        label: 'Plans',          href: '/?mode=forge',        icon: Zap,             kind: 'top', spineBand: false, requires: 'operations.plans.view' },
  // NO standalone Tasks row.
  // (`/?mode=tasks`, see SIDEBAR_PAGE_NAV) — operator 2026-09-22: *"focus on
  { id: 'settings',          label: 'Settings',    href: '/settings',           icon: Settings,        kind: 'top', spineBand: false },
  // Monitor — TV / observe-only Operations Live (+ Analytics / History / …).
  { id: 'operations',        label: 'Operations',  href: '/operations',         icon: Monitor,         kind: 'main', mainGroup: 'monitor', requires: 'operations.view' },
  // Reports — DATED, per-entity, exportable tables (Staff day · Bin utilization · Velocity · Dead stock).
  // **A PARENT-LEVEL row, not a Monitor member** (operator 2026-09-15:
  { id: 'reports',            label: 'Reports',     href: '/reports',            icon: BarChart3,       kind: 'top', requires: 'operations.view' },
  // Scan Stations — scan-first benches (Arrival / Unbox / Pickup / Repair
  // Service / Quality Control / Ready to Pack / Packing / Scan out).
  { id: 'triage',            label: 'Arrival',     href: '/triage',             icon: RECEIVING_NAV_ICONS.triage,  kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view' },
  { id: 'receive',           label: 'Unbox',       href: '/unbox',              icon: RECEIVING_NAV_ICONS.receive, kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view' },
  { id: 'pickup',            label: 'Local Pickup', href: '/pickup',            icon: RECEIVING_NAV_ICONS.pickup,  kind: 'station', stationGroup: 'floor', stationSubgroup: 'walk-in', requires: 'receiving.view' },
  { id: 'repair',            label: 'Repair Service', href: '/repair',          icon: RECEIVING_NAV_ICONS.repair,  kind: 'station', stationGroup: 'floor', stationSubgroup: 'walk-in', requires: 'receiving.view' },
  // Quality Control + Ready to Pack are first-class Scan Stations rows (no
  // parent Testing). Route key still resolves to `tech` for the shared panel.
  { id: 'testing',           label: 'Quality Control', href: '/test?view=testing', icon: TECH_NAV_ICONS.testing,  kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view' },
  { id: 'ready-to-pack',     label: 'Picker',          href: '/test?ship=urgent',    icon: TECH_NAV_ICONS.shipping, kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view' },
  // Points at the first-class Pack surface (`/pack`) so the primary nav lands on
  // the canonical URL without a redirect hop. Route key still resolves to
  // 'packer' (reuses the packer panel), so the item stays active on /pack + /packer.
  { id: 'packer',            label: 'Packing',     href: '/pack',               icon: STATION_PAGE_ICONS.packer,    kind: 'station', stationGroup: 'floor', requires: 'packing.view' },
  // Scan out stays on the floor as a modeless dock-confirm station. Labels /
  // Amazon Prep live under Shipping. Route key still resolves to 'outbound'
  // for panel chrome across every shipping mode.
  { id: 'scan-out',          label: 'Scan out',    href: OUTBOUND_MODE_PATHS['scan-out'], icon: SHIPPING_NAV_ICONS['scan-out'], kind: 'station', stationGroup: 'floor', requires: 'shipping.view' },
  // ── Inbound ─────────────────────────────────────────────────────────────── The pointer-driven COUNTERPART of the receiving benches:
  // **Faced `Deliveries`, not `Inbound` (operator 2026-09-14).** This row sits
  { id: 'incoming',          label: 'Deliveries', href: '/incoming',           icon: RECEIVING_NAV_ICONS.incoming, kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view', keywords: ['inbound', 'incoming', 'arrivals', 'on the way', 'cartons', 'deliveries'] },
  // ── Catalog ─────────────────────────────────────────────────────────────── Manage Products.
  { id: 'products',          label: 'Products',    href: '/products',           icon: Tags,            kind: 'domain', domainGroup: 'catalog', requires: 'sku_stock.view' },
  // ── Inventory ─────────────────────────────────────────────────────────────
  // Physical stock + Locations.
  { id: 'inventory',         label: 'Inventory',   href: '/inventory',          icon: ShelvingUnit,    kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view' },
  // Sourcing rides the INBOUND lane (N4, operator 2026-09-14): demand → PO →
  // on the way → received is one direction. The 2026-08-03 ruling only kept it
  // out of *Inventory*; the row itself is unchanged.
  { id: 'sourcing',          label: 'Sourcing',    href: '/sourcing',           icon: ShoppingCart,    kind: 'domain', domainGroup: 'inbound', requires: 'sourcing.view' },
  // Locations folded under Inventory L2 (`/inventory/locations`) — P4 condensation.
  { id: 'outbound',          label: 'Shipping',    href: SHIPPING_ORDERS_PATH, icon: STATION_PAGE_ICONS.outbound,  kind: 'domain', domainGroup: 'fulfillment', requires: 'shipping.view' },
  // FBA rides the Outbound lane beside Shipping (operator 2026-09-14).
  // FBA rides the Outbound lane beside Shipping (operator 2026-09-14). The href
  { id: 'fba',               label: 'FBA',         href: OUTBOUND_MODE_PATHS.fba, icon: SHIPPING_NAV_ICONS.fba, kind: 'domain', domainGroup: 'fulfillment', requires: 'fba.view' },
  // Label intake rides the Outbound lane beside Shipping and FBA (V1 outbound plan, 2026-09-23).
  { id: 'label-intake',      label: 'Label intake', href: SHIPPING_LABEL_INTAKE_PATH, icon: SHIPPING_NAV_ICONS.labels, kind: 'domain', domainGroup: 'fulfillment', requires: 'packing.review', keywords: ['labels', 'label pdf', 'quarantine', 'tracking', 'ingestion'] },
  // ── Sales ───────────────────────────────────────────────────────────────── Own root (D4) — front-desk history, not a fulfillment lane.
  { id: 'sales',             label: 'Sales',       href: `/dashboard?mode=${DASHBOARD_SALES_MODE}`, icon: SalesPrice, kind: 'domain', domainGroup: 'sales', requires: 'dashboard.view' },
  // Counter is a Sales child (`SIDEBAR_PAGE_NAV`), not its own L1 row.
  { id: 'support',           label: 'Support',     href: '/support',            icon: AlertCircle,     kind: 'domain', domainGroup: 'support', requires: 'integrations.zendesk' },
  // ── End of map (was footer pins) ────────────────────────────────────────── Automations (href stays /studio).
  { id: 'studio',            label: 'Automations', href: '/studio',         icon: Workflow,        kind: 'main', mainGroup: 'studio', requires: 'studio.view' },
  // Audit Log is no longer a top-level sidebar row — it lives under Operations › Logs (AdminLogsTab, with the Audit filter).
];

export function isSidebarRouteMobileRestricted(routeKey: SidebarRouteKey): boolean {
  return MOBILE_RESTRICTED_SIDEBAR_IDS.has(routeKey);
}

export interface GetSidebarNavItemsOpts {
  mobileRestricted?: boolean;
  /** Set of permission strings the current user holds. */
  permissions?: ReadonlySet<string>;
  /** Active org environment. Sandbox-only items hide unless this is 'sandbox'. */
  organizationEnvironment?: 'sandbox' | 'customer' | null;
}

export function getSidebarNavItems(opts: GetSidebarNavItemsOpts = {}): SidebarNavItem[] {
  const { mobileRestricted = false, permissions, organizationEnvironment } = opts;
  let items: SidebarNavItem[] = APP_SIDEBAR_NAV;
  if (mobileRestricted) {
    items = items.filter((item) => !isSidebarRouteMobileRestricted(item.id as SidebarRouteKey));
  } else {
    items = items.map((item) =>
      item.desktopIcon ? { ...item, icon: item.desktopIcon } : item,
    );
  }
  if (permissions) {
    items = items.filter((item) => !item.requires || permissions.has(item.requires));
  }
  items = items.filter((item) => !item.sandboxOnly || organizationEnvironment === 'sandbox');
  // THE MOBILE-FIRST GATE (operator 2026-09-14):
  // THE MOBILE-FIRST GATE (operator 2026-09-14): a lane the phone cannot run
  items = items.filter((item) => isLaneVisible(spineSectionIdForPage(item) ?? ''));
  return items;
}

/** Route keys that render the **two-card station column** (nav card on top, recents + scan bar card below) instead of the classic single… */
const STATION_SURFACE_ROUTE_KEYS = new Set<SidebarRouteKey>([
  'receiving',
  'outbound',
  'tech',
  'packer',
  'review',
  'support',
]);

export function isStationSurfaceRoute(pathname: string | null): boolean {
  return STATION_SURFACE_ROUTE_KEYS.has(getSidebarRouteKey(pathname));
}

/**
 * Surfaces that run **rail-less** — Pattern E, no left context column.
 * title row (operator ruling 2026-08-31: keep the rail, decouple the flags).
 */
export function isRaillessSurface(
  pathname: string | null,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): boolean {
  if (!pathname) return false;
  // Params matter for `/dashboard`, which is multi-domain: the outbound domain
  // resolves to the `outbound` page, while `?mode=sales` resolves to `sales`
  // and keeps its walk-in picker.
  if (
    getSidebarPageNav(getSidebarNavPageId(pathname, searchParams ?? null))?.railless === true
  ) {
    return true;
  }
  // `/studio/automations` (Automations › **Rules**) is rail-less:
  if (pathname === '/studio/automations' || pathname.startsWith('/studio/automations/')) {
    return true;
  }
  // Support keeps ONE left column: Tickets recents. Voicemail / Calls /
  // Warranty / Issues pick from the stage itself (same as the <md path).
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    const mode = String(searchParams?.get('mode') ?? '').trim().toLowerCase();
    return (
      mode === 'voicemail' ||
      mode === 'calls' ||
      mode === 'warranty' ||
      mode === 'issues' ||
      mode === 'orders'
    );
  }
  // Support's ticket alias (`?context=support`) claims this URL for the spine pin / desk title, but the stage is still the Shipping To-ship…
  // already retired (operator 2026-08-31).
  if (
    pathname === SHIPPING_ORDERS_PATH ||
    pathname.startsWith(`${SHIPPING_ORDERS_PATH}/`)
  ) {
    return getSidebarPageNav('outbound')?.railless === true;
  }
  return false;
}

/** @deprecated Prefer {@link isRaillessSurface} — same predicate, old name. */
export const isDeskStageSurface = isRaillessSurface;

/** Route keys whose sidebar spine carries a per-route **context panel** — a picker / rail that is the route's primary navigator (Products'… */
const CONTEXT_PANEL_ROUTE_KEYS = new Set<SidebarRouteKey>([
  // `home` dropped 2026-08-12 — Today is rail-less (Pattern E).
  'dashboard',
  'operations',
  'studio',
  // `settings` DROPPED 2026-09-10 — Pattern E card landing + /settings/me.
  // Roles/Access still need their picker rails; those paths are special-cased
  // in hasSidebarContextPanel below (the route key stays `settings`).
  'audit-log',
  'fba',
  // `inventory` DROPPED 2026-09-15 — operator:
  'sourcing',
  'products',
  // `walk-in` dropped — `/walk-in` is a redirect shell; sales context rides the dashboard panel (`WalkInHistorySidebar` when domain === sales).
]);

/** True when this route's spine holds a context panel — see {@link CONTEXT_PANEL_ROUTE_KEYS}. */
export function hasSidebarContextPanel(pathname: string | null): boolean {
  // Roles / Access still mount picker sidebars; overview settings is railless.
  if (pathname === '/settings/roles' || pathname?.startsWith('/settings/roles/')) return true;
  if (pathname === '/settings/access' || pathname?.startsWith('/settings/access/')) return true;
  return CONTEXT_PANEL_ROUTE_KEYS.has(getSidebarRouteKey(pathname));
}

export function getSidebarRouteKey(pathname: string | null): SidebarRouteKey {
  if (!pathname) return 'unknown';
  if (pathname === '/') return 'home';
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return 'dashboard';
  // `/o/[orderId]` permanently redirects to search feedback — no dedicated
  // order workspace sidebar.
  if (pathname === '/operations' || pathname.startsWith('/operations/')) return 'operations';
  if (pathname === '/signals' || pathname.startsWith('/signals/')) return 'operations';
  if (pathname === '/ops/photos' || pathname.startsWith('/ops/photos/')) return 'ops-photos';
  if (pathname === '/studio' || pathname.startsWith('/studio/')) return 'studio';
  if (pathname === '/fba' || pathname.startsWith('/fba/')) return 'fba';
  // `/unbox` + `/triage` are the first-class receiving surfaces — they reuse the
  // receiving sidebar panel + right pane, so they resolve to the `receiving` key.
  if (pathname === '/unbox' || pathname.startsWith('/unbox/')) return 'receiving';
  if (pathname === '/triage' || pathname.startsWith('/triage/')) return 'receiving';
  if (pathname === '/incoming' || pathname.startsWith('/incoming/')) return 'receiving';
  // Local Pickup + Repair are Walk-In Scan Station benches (front-desk), so
  // `/pickup` stays on the receiving key — that's what mounts the receiving
  // sidebar + its mode rail.
  if (pathname === '/pickup' || pathname.startsWith('/pickup/')) return 'receiving';
  // `/receiving/history` (+ every other receiving sub-route) resolves here too.
  if (pathname === '/receiving' || pathname.startsWith('/receiving/')) return 'receiving';
  if (pathname === '/walk-in' || pathname.startsWith('/walk-in/')) return 'walk-in';
  // Repair is a Receiving mode with its own route — it mounts the receiving
  // sidebar + rail, not the Sales page's.
  if (pathname === '/repair' || pathname.startsWith('/repair/')) return 'receiving';
  if (pathname === '/replenish' || pathname.startsWith('/replenish/')) return 'replenish';
  if (pathname === '/products' || pathname.startsWith('/products/')) return 'products';
  if (pathname === '/warehouse' || pathname.startsWith('/warehouse/')) return 'inventory';
  if (pathname === '/sourcing' || pathname.startsWith('/sourcing/')) return 'sourcing';
  if (pathname === '/inventory' || pathname.startsWith('/inventory/')) return 'inventory';
  if (pathname === '/support' || pathname.startsWith('/support/')) return 'support';
  if (pathname === '/ai-chat' || pathname.startsWith('/ai-chat/')) return 'ai-chat';
  if (pathname === '/audit-log' || pathname.startsWith('/audit-log/')) return 'audit-log';
  if (pathname === '/settings/audit' || pathname.startsWith('/settings/audit/')) return 'audit-log';
  // `/test` is the first-class Testing surface; it reuses the `tech` sidebar
  // panel + station, so it resolves to the `tech` key (legacy `/tech` too).
  if (pathname === '/test' || pathname.startsWith('/test/')) return 'tech';
  if (pathname === '/tech' || pathname.startsWith('/tech/')) return 'tech';
  // `/pack` is the first-class Packing surface; it reuses the `packer` sidebar
  // panel + station, so it resolves to the `packer` key (legacy `/packer` too).
  if (pathname === '/pack' || pathname.startsWith('/pack/')) return 'packer';
  if (pathname === '/packer' || pathname.startsWith('/packer/')) return 'packer';
  // Review station (WS-REVIEW) — resolves to its own key across every mode.
  if (pathname === '/review' || pathname.startsWith('/review/')) return 'review';
  // `/shipping` is the first-class Shipping surface; it reuses the `outbound`
  // sidebar panel + station key (legacy `/outbound` too).
  if (pathname === '/shipping' || pathname.startsWith('/shipping/')) return 'outbound';
  if (pathname === '/outbound' || pathname.startsWith('/outbound/')) return 'outbound';
  // /manuals now redirects to /products (see src/app/manuals/page.tsx)
  if (pathname === '/manuals' || pathname.startsWith('/manuals/')) return 'products';
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings';
  // `/search` — header find + SearchBrowseShell; `?sel=type:id` opens full-bleed detail.
  if (pathname === '/search' || pathname.startsWith('/search/')) return 'search';
  return 'unknown';
}

/** MasterNav L1 page id for the current path. */
export function getSidebarNavPageId(
  pathname: string | null,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): string {
  if (!pathname) return 'unknown';
  if (pathname === '/unbox' || pathname.startsWith('/unbox/')) return 'receive';
  if (pathname === '/triage' || pathname.startsWith('/triage/')) return 'triage';
  if (pathname === '/incoming' || pathname.startsWith('/incoming/')) return 'incoming';
  if (pathname === '/pickup' || pathname.startsWith('/pickup/')) return 'pickup';
  if (pathname === '/repair' || pathname.startsWith('/repair/')) return 'repair';
  // Legacy `/receiving` (+ history) lands on Unbox — same default as before.
  if (pathname === '/receiving' || pathname.startsWith('/receiving/')) return 'receive';
  // Dashboard boards dissolved into their domain homes (D5):
  if (pathname === '/counter' || pathname.startsWith('/counter/')) return 'sales';
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    const domain = String(searchParams?.get('mode') ?? '').trim().toLowerCase();
    if (domain === 'inbound' || domain === 'receiving') return 'incoming';
    if (domain === 'sales' || domain === 'pickup' || domain === 'repairs') return 'sales';
    // Bare / `?unshipped` / `?shipped` / legacy `?pending` = the outbound orders
    // queue, which Fulfillment owns.
    return 'outbound';
  }
  // Review splits by `?mode=` (D10):
  if (pathname === '/review' || pathname.startsWith('/review/')) {
    const mode = String(searchParams?.get('mode') ?? '').trim().toLowerCase();
    return mode === 'pairing' || mode === 'catalog-link' ? 'products' : 'operations';
  }
  // Shipping: Scan out is its own Scan Stations L1; FBA is its own Outbound
  // lane row (2026-09-14); the rest of `/shipping/*` is the To-ship desk.
  // Support › Inquiries aliases `/shipping/orders?context=support` — Support owns the spine pin.
  if (
    (pathname === '/shipping/orders' || pathname.startsWith('/shipping/orders/')) &&
    String(searchParams?.get('context') ?? '').trim().toLowerCase() === 'support'
  ) {
    return 'support';
  }
  const outboundMode = outboundModeFromPath(pathname);
  if (outboundMode === 'scan-out') return 'scan-out';
  // The FBA board is its own page now, so the spine lights the FBA row and the
  // desk frame reads its title and rail policy from the `fba` entry. The route
  // KEY stays `outbound` (`getSidebarRouteKey`) — panel chrome is unchanged.
  if (outboundMode === 'fba') return 'fba';
  if (pathname === SHIPPING_LABEL_INTAKE_PATH || pathname.startsWith(`${SHIPPING_LABEL_INTAKE_PATH}/`)) return 'label-intake';
  if (outboundMode) return 'outbound';
  if (pathname === '/shipping/orders' || pathname.startsWith('/shipping/orders/')) return 'outbound';
  if (pathname === '/reports' || pathname.startsWith('/reports/')) return 'reports';
  // Testing family promoted: Quality Control vs Ready to Pack share `/test`
  // (`?view=testing`). Panel mount still uses route key `tech`.
  if (
    pathname === '/test' ||
    pathname.startsWith('/test/') ||
    pathname === '/tech' ||
    pathname.startsWith('/tech/')
  ) {
    const view = String(searchParams?.get('view') ?? '').trim().toLowerCase();
    if (view === 'testing' || view === 'testing-history') return 'testing';
    return 'ready-to-pack';
  }
  return getSidebarRouteKey(pathname);
}

/** MasterNav L1 row ({@link APP_SIDEBAR_NAV}) for a page id. */
export function getMasterNavItem(pageId: string): SidebarNavItem | undefined {
  if (!pageId || pageId === 'unknown') return undefined;
  return APP_SIDEBAR_NAV.find((item) => item.id === pageId);
}

export function masterNavItemForPath(
  pathname: string | null,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): SidebarNavItem | undefined {
  return getMasterNavItem(getSidebarNavPageId(pathname, searchParams ?? null));
}

/** Path + query → live MasterNav L1 label (`Shipping`, `Scan out`, `Media Library`). */
export function masterNavLabelForPath(
  pathname: string | null,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): string {
  return masterNavItemForPath(pathname, searchParams)?.label ?? 'Daily';
}

export function masterNavItemForHref(href: string): SidebarNavItem | undefined {
  try {
    const url = new URL(href, 'http://local');
    return masterNavItemForPath(url.pathname, url.searchParams);
  } catch {
    return undefined;
  }
}

function getFirstPathSegment(path: string): string {
  const [segment = ''] = path.split('/').filter(Boolean);
  // Normalize the Packing surface aliases (`/pack`, `/packer`, `/packers`) to a
  // single `pack` segment so the nav item stays active across the migration.
  if (segment === 'packers' || segment === 'packer') return 'pack';
  // Normalize the legacy Testing route (`/tech`) to the canonical `test` segment
  // so the nav item stays active across the migration.
  if (segment === 'tech') return 'test';
  // Normalize legacy Shipping (`/outbound`) to canonical `/shipping`.
  if (segment === 'outbound') return 'shipping';
  return segment;
}

export function isSidebarNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;

  // Strip query/hash so an href like `/dashboard?mode=sales` does not poison
  // path matching.
  const hrefPath = href.split(/[?#]/, 1)[0] ?? href;

  const hrefSegment = getFirstPathSegment(hrefPath);
  const pathnameSegment = getFirstPathSegment(pathname);

  if (hrefSegment === 'test' || hrefSegment === 'pack' || hrefSegment === 'shipping') {
    return pathnameSegment === hrefSegment;
  }

  if (hrefPath === '/') {
    return pathname === '/';
  }

  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

/** Top-pin active state. */
export function isSidebarTopPinActive(
  pin: Pick<SidebarNavItem, 'id' | 'href'>,
  loc: {
    pathname: string | null;
    searchParams: Pick<URLSearchParams, 'get'>;
  },
): boolean {
  return isSidebarNavActive(loc.pathname, pin.href);
}

/**
 * Whether a `kind: 'top'` pin paints as an ordinary L1 row at the top of the
 * spine map. Registry rows with `spineBand: false` (Search, Plans, Chat,
 * Settings) stay reachable via ⌘K / URL / the account ⋯ menu.
 */
export function isSpineMapTopRow(item: SidebarNavItem): boolean {
  return item.kind === 'top' && item.spineBand !== false;
}

/**
 * Pointer desk on the MasterNav map — domain rows plus Operations (monitor).
 * Floor benches and Studio are not desks.
 */
export function isSpineDeskItem(
  item: Pick<SidebarNavItem, 'kind'> & { mainGroup?: MainGroupId },
): boolean {
  if (item.kind === 'domain') return true;
  return item.kind === 'main' && item.mainGroup === 'monitor';
}

/** Section ids that belong in the Workspaces family (not Scan Stations / Studio). */
export function isDeskSpineSection(id: SpineSectionId | null): boolean {
  if (!id || id === 'floor' || id === 'studio') return false;
  return true;
}

/** The Workspaces lanes, in {@link SPINE_SECTIONS} order — Inbound → Outbound → Inventory → Products → Sales → Support → Operations. */
export const DESK_SPINE_SECTIONS = SPINE_SECTIONS.filter(
  (section) => isDeskSpineSection(section.id) && isLaneVisible(section.id),
);

/** @deprecated Prefer {@link isSpineMapTopRow} — the spine band icons are gone. */
export const isSpineBandTopPin = isSpineMapTopRow;

/** Route → required permission map. */
export const ROUTE_PERMISSIONS: ReadonlyArray<{ prefix: string; permission: string }> = [
  { prefix: '/audit-log',          permission: 'admin.view_logs' },
  { prefix: '/admin',              permission: 'admin.view' },
  { prefix: '/ops/photos',           permission: 'photos.view' },
  { prefix: '/operations',         permission: 'operations.view' },
  { prefix: '/signals',            permission: 'operations.view' },
  { prefix: '/dashboard',          permission: 'dashboard.view' },
  // Dedicated order workspace — same gate as the dashboard order surfaces.
  { prefix: '/o',                  permission: 'dashboard.view' },
  { prefix: '/fba',                permission: 'fba.view' },
  { prefix: '/walk-in',            permission: 'walk_in.view' },
  // The counter desk — a Sales surface, not a Scan Station (no scanner, no
  // Station chrome). Same gate as the rest of the walk-in family.
  { prefix: '/counter',            permission: 'walk_in.view' },
  // Repair + Local Pickup are Receiving modes — same gate as the rest of the
  // rail. The `repair.*` tech permissions still gate the repair APIs; they no
  // longer gate the UI (a receiving operator works the whole rail).
  { prefix: '/repair',             permission: 'receiving.view' },
  { prefix: '/receiving',          permission: 'receiving.view' },
  // `/unbox` + `/triage` + `/incoming` are first-class receiving surfaces (same gate).
  { prefix: '/unbox',              permission: 'receiving.view' },
  { prefix: '/triage',             permission: 'receiving.view' },
  { prefix: '/incoming',           permission: 'receiving.view' },
  { prefix: '/pickup',             permission: 'receiving.view' },
  // `/test` is the first-class Testing surface (legacy `/tech`).
  { prefix: '/test',               permission: 'tech.view' },
  { prefix: '/tech',               permission: 'tech.view' },
  { prefix: '/wipe',               permission: 'tech.data_wipe' },
  // `/pack` is the first-class Packing surface (legacy `/packer` / `/packers`).
  { prefix: '/pack',               permission: 'packing.view' },
  { prefix: '/packer',             permission: 'packing.view' },
  { prefix: '/packers',            permission: 'packing.view' },
  { prefix: '/review',             permission: 'packing.review' },
  // To-ship desk is orders-entity gated (shared with Support › Inquiries).
  // Longer prefix must beat `/shipping` → shipping.view.
  { prefix: SHIPPING_LABEL_INTAKE_PATH, permission: 'packing.review' },
  { prefix: '/shipping/orders',    permission: 'orders.view' },
  { prefix: '/shipping',           permission: 'shipping.view' },
  { prefix: '/outbound',           permission: 'shipping.view' },
  { prefix: '/products',           permission: 'sku_stock.view' },
  { prefix: '/warehouse',          permission: 'sku_stock.view' },
  { prefix: '/sourcing',           permission: 'sourcing.view' },
  { prefix: '/inventory',          permission: 'sku_stock.view' },
  // /support is the native Zendesk ticket console — gated by the same
  // permission as the /api/zendesk/* routes it calls.
  { prefix: '/support',            permission: 'integrations.zendesk' },
  { prefix: '/ai-chat',            permission: 'assistant.chat' },
  // Plans Live (master-plan console). Same gate as the Plans spine pin and
  // `/api/forge/master-plan`. Needed since 2026-08-19: `/forge` used to redirect
  // into a self-gated Home mode, so the route map never had to name it.
  { prefix: '/forge',              permission: 'operations.plans.view' },
  // /settings is intentionally NOT gated — every signed-in user can manage
  // their own workstation/appearance settings; admin tabs gate themselves.
  // (/manuals now redirects into /products)
];

export function permissionForPath(pathname: string): string | null {
  for (const entry of ROUTE_PERMISSIONS) {
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix + '/')) {
      return entry.permission;
    }
  }
  return null;
}

/* ═══════════════════ MASTER SIDEBAR NAV — page + child page ═══════════════════ */

/** A search-param delta map: value to set, or `null` to delete the key. */
export type SearchParamDelta = Record<string, string | null>;

interface ChildNavTarget {
  /** Absolute pathname to land on (a child may live on a sub-path, e.g. unfound). */
  pathname: string;
  /** Search-param mutations applied on top of the current params. */
  params?: SearchParamDelta;
}

export interface ChildLocation {
  pathname: string;
  params: Pick<URLSearchParams, 'get' | 'has'>;
}

export interface SidebarChildPage {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  /** Build the nav target for this child (relative to the page's base href). */
  to: () => ChildNavTarget;
  /** Optional per-child permission gate (e.g. admin sub-sections). */
  requires?: string;
  /**
   * Optional group heading shown above this child's row in a listing (e.g. the
   * admin sections' People / Data sources / System). Omitted = no header.
   */
  group?: string;
  /* There is deliberately NO `parked` field here. */
}

export type SidebarPageNav = SidebarNavItem & {
  /** This page's child pages. Omitted for single-surface pages. */
  children?: SidebarChildPage[];
  /** Opted in to **desk page chrome** (`docs/todo/desk-page-chrome-fixed-width-PLAN.md`): */
  deskChrome?: true;
  /**
   * Runs **rail-less** — Pattern E, no 360px left context column.
   * Operator ruling 2026-08-31: keep the rail, decouple the flags.
   */
  railless?: true;
  /**
   * Read the active child id from a location. Always returns an id present in
   * `children` (defaulting to the page's leftmost/default child). Only defined
   * for pages that have `children`.
   */
  resolveChild?: (loc: ChildLocation) => string | null;
};

// Page hrefs are repeated from APP_SIDEBAR_NAV so each mode's `to()` is a pure,
// self-contained literal (no closure over the array).
const DASHBOARD = '/dashboard';
const OPERATIONS = '/operations';
// Unbox + Triage graduated to their own first-class surface routes (operator-surfaces refactor Phases 1–2); those modes navigate to them.
const UNBOX = '/unbox';
const TRIAGE = '/triage';
const PICKUP = '/pickup';
const REPAIR = '/repair';
const INCOMING = '/incoming';
const INVENTORY = '/inventory';
const SOURCING = '/sourcing';
const PRODUCTS = '/products';
// Testing graduated to its own first-class surface route (`/test`, operator-surfaces refactor Phase 8); its modes navigate there (the…
const TECH = '/test';
const SUPPORT = '/support';
// Packing graduated to its own first-class surface route (`/pack`,
// operator-surfaces refactor Phase 7); its modes navigate there. Legacy
// `/packer` still resolves (proxy redirect + shared page).
const PACK = '/pack';
const REVIEW = '/review';

export const SIDEBAR_PAGE_NAV: SidebarPageNav[] = [
  // ── Daily (was Home) ──────────────────────────────────────────────────────
  {
    id: 'home', label: 'Daily', href: '/', icon: ListChecks, kind: 'top',
    deskChrome: true,
  },
  // ── Chat ─────────────────────────────────────────────────────────────────── No views: its panel is the staffer's
  // threads (`NAV_PAGE_DECLS['ai-chat'].recentsPanel`), led by New chat.
  {
    id: 'ai-chat', label: 'Chat', href: '/ai-chat', icon: MessageSquare, kind: 'top', requires: 'assistant.chat',
  },
  // ── Sales (front-desk history) ──────────────────────────────────────────── The `/dashboard` sales domain, promoted to its own root…
  {
    id: 'sales', label: 'Sales', href: `${DASHBOARD}?mode=${DASHBOARD_SALES_MODE}`, icon: SalesPrice,
    kind: 'domain', domainGroup: 'sales', requires: 'dashboard.view',
    // Desk page chrome (2026-08-31):
    deskChrome: true,
    children: [
      { id: 'counter', label: 'Counter', icon: SalesModeCounter, requires: 'walk_in.view', to: () => ({ pathname: '/counter', params: {} }) },
      { id: 'sales', label: 'Sales Board', icon: SalesPrice, requires: DASHBOARD_SALES_PERMISSION, to: () => ({ pathname: DASHBOARD, params: { mode: DASHBOARD_SALES_MODE } }) },
      { id: 'pickup', label: 'Local Pickup', icon: ShoppingCart, requires: DASHBOARD_SALES_PERMISSION, to: () => ({ pathname: DASHBOARD, params: { mode: 'pickup' } }) },
      { id: 'repairs', label: 'Repair Service', icon: RECEIVING_NAV_ICONS.repair, requires: 'repair.view', to: () => ({ pathname: DASHBOARD, params: { mode: DASHBOARD_REPAIRS_MODE } }) },
    ],
    resolveChild: ({ params, pathname }) => {
      if (pathname.startsWith('/counter')) return 'counter';
      const mode = params.get('mode');
      if (mode === 'pickup') return 'pickup';
      if (mode === 'repairs') return 'repairs';
      return 'sales';
    },
  },
  // ── Operations ──────────────────────────────────────────────────────────── `?mode=history|signals`; bare /operations = the Live…
  {
    id: 'operations', label: 'Operations', href: OPERATIONS, icon: Monitor, kind: 'main', mainGroup: 'monitor', requires: 'operations.view',
    // Desk page chrome (2026-08-31): the children below are drawn as IN-PAGE
    // tabs by the Operations desk, so the spine row stays a flat leaf.
    // NOT `railless` — this desk navigates by its context rail.
    deskChrome: true,
    children: [
      // Each target used to null twelve sibling keys by hand — the largest of the nine deleted denylists, re-stated once per mode.
      { id: 'live',      label: 'Live',      icon: Activity,  to: () => ({ pathname: OPERATIONS, params: { mode: null } }) },
      { id: 'checks',    label: 'Checks',    icon: ClipboardList, to: () => ({ pathname: OPERATIONS, params: { mode: 'checks' } }) },
      // Pack QA desk queue — KPI / exception surface, not a Scan Station.
      // Empty delta: `/review` param spec; bare URL is the packing lane.
      { id: 'packing-review', label: 'Packing Review', icon: ClipboardList, requires: 'packing.review', to: () => ({ pathname: REVIEW, params: {} }) },
      // 'analytics' removed 2026-09-16 — see the note above this entry.
      { id: 'history',   label: 'History',   icon: History,   to: () => ({ pathname: OPERATIONS, params: { mode: 'history' } }) },
      { id: 'signals',   label: 'Signals',   icon: Zap,       to: () => ({ pathname: OPERATIONS, params: { mode: 'signals' } }) },
      { id: 'reconciliation', label: 'Reconcile', icon: Link2, to: () => ({ pathname: OPERATIONS, params: { mode: 'reconciliation' } }) },
      // ── Absorbed from /admin (dissolution W1) ───────────────────────────── Performance + system observability are monitor work.
      { id: 'goals',     label: 'Goals',     icon: BarChart3, to: () => ({ pathname: OPERATIONS, params: { mode: 'goals' } }) },
      { id: 'quality',   label: 'Quality',   icon: ShieldCheck, requires: 'sku_stock.view', to: () => ({ pathname: OPERATIONS, params: { mode: 'quality' } }) },
      { id: 'staff',     label: 'People',    icon: User, requires: 'admin.manage_staff', to: () => ({ pathname: OPERATIONS, params: { mode: 'staff' } }) },
      { id: 'sync',      label: 'Sync',      icon: Activity, to: () => ({ pathname: OPERATIONS, params: { mode: 'sync' } }) },
      { id: 'logs',      label: 'Logs',      icon: FileText, requires: 'admin.view_logs', to: () => ({ pathname: OPERATIONS, params: { mode: 'logs' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      if (pathname === REVIEW || pathname.startsWith(`${REVIEW}/`)) {
        const mode = String(params.get('mode') ?? '').trim().toLowerCase();
        // Pairing / catalog-link are Products' work — Operations does not claim them.
        if (mode === 'pairing' || mode === 'catalog-link') return null;
        return 'packing-review';
      }
      const m = params.get('mode');
      // An old `?mode=analytics` link resolves to no child and falls through to
      // 'live', matching what OperationsWorkspace renders for it.
      if (m === 'history') return 'history';
      if (m === 'signals') return 'signals';
      if (m === 'reconciliation') return 'reconciliation';
      if (m === 'goals') return 'goals';
      if (m === 'quality') return 'quality';
      if (m === 'staff') return 'staff';
      if (m === 'sync') return 'sync';
      if (m === 'logs') return 'logs';
      if (m === 'checks') return 'checks';
      return 'live';
    },
  },
  // ── Reports ──────────────────────────────────────────────────────────────── `?tab=` — the seven tabs `src/app/reports/page.tsx` renders (`REPORT_TABS`); Staff day is the bare URL.
  {
    // `kind: 'top'` must match the APP_SIDEBAR_NAV twin above — the two
    // registries are kept in lockstep, and a `main`/`top` split would put the
    // row in the lane band on one code path and above it on the other.
    id: 'reports', label: 'Reports', href: '/reports', icon: BarChart3, kind: 'top', requires: 'operations.view',
    deskChrome: true,
    children: [
      { id: 'staff-day',   label: 'Staff day',       icon: ClipboardList, to: () => ({ pathname: '/reports', params: { tab: null } }) },
      { id: 'packer-day',  label: 'Packer day',      icon: Package,       to: () => ({ pathname: '/reports', params: { tab: 'packer' } }) },
      { id: 'utilization', label: 'Bin Utilization', icon: BarChart3,     to: () => ({ pathname: '/reports', params: { tab: 'utilization' } }) },
      { id: 'velocity',    label: 'Velocity (30d)',  icon: TrendingUp,    to: () => ({ pathname: '/reports', params: { tab: 'velocity' } }) },
      { id: 'dead-stock',  label: 'Dead Stock',      icon: FileText,      to: () => ({ pathname: '/reports', params: { tab: 'dead' } }) },
      { id: 'tasks',       label: 'Tasks',           icon: ListChecks,    to: () => ({ pathname: '/reports', params: { tab: 'tasks' } }) },
      { id: 'activity',    label: 'Task time',       icon: Clock,         to: () => ({ pathname: '/reports', params: { tab: 'activity' } }) },
    ],
    resolveChild: ({ params }) => {
      const tab = params.get('tab');
      if (tab === 'packer') return 'packer-day';
      if (tab === 'utilization') return 'utilization';
      if (tab === 'velocity') return 'velocity';
      if (tab === 'dead') return 'dead-stock';
      if (tab === 'tasks') return 'tasks';
      if (tab === 'activity') return 'activity';
      return 'staff-day';
    },
  },
  // ── Receiving family (promoted L1 stations; modeless in MasterNav) ──────── Former Receiving modes are first-class spine rows.
  {
    id: 'triage', label: 'Arrival', href: TRIAGE, icon: RECEIVING_NAV_ICONS.triage,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view',
  },
  {
    id: 'receive', label: 'Unbox', href: UNBOX, icon: RECEIVING_NAV_ICONS.receive,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view',
  },
  {
    id: 'pickup', label: 'Local Pickup', href: PICKUP, icon: RECEIVING_NAV_ICONS.pickup,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'walk-in', requires: 'receiving.view',
  },
  {
    id: 'repair', label: 'Repair Service', href: REPAIR, icon: RECEIVING_NAV_ICONS.repair,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'walk-in', requires: 'receiving.view',
    // Rail-less (2026-09-16):
    railless: true,
  },
  {
    id: 'testing', label: 'Quality Control', href: `${TECH}?view=testing`, icon: TECH_NAV_ICONS.testing,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view',
  },
  {
    id: 'ready-to-pack', label: 'Picker', href: `${TECH}?ship=urgent`, icon: TECH_NAV_ICONS.shipping,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view',
  },
  // ── Inbound (Manage Inbound) ────────────────────────────────────────────── Single desk at `/incoming`:
  // Faced **Deliveries** (operator 2026-09-14 — never the same name as its
  {
    id: 'incoming', label: 'Deliveries', href: INCOMING, icon: RECEIVING_NAV_ICONS.incoming,
    kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view',
    // Rail-less since before desk chrome existed, and now DECLARED rather than special-cased inside `isRaillessSurface` (2026-08-31).
    // `deskChrome` (operator 2026-09-14): the desk's two LANES are its tab row.
    railless: true,
    deskChrome: true,
    children: [
      { id: 'pipeline', label: 'On the way', icon: RECEIVING_NAV_ICONS.incoming, to: () => ({ pathname: INCOMING, params: { lane: null, view: null } }) },
      { id: 'docked',   label: 'History', icon: History,                      to: () => ({ pathname: INCOMING, params: { lane: 'docked', view: null } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      // Legacy `/dashboard?mode=inbound` resolves the PAGE to Inbound but is
      // not on either lane yet — the proxy redirects it. Lighting a tab there
      // would claim the operator is somewhere they are not.
      if (pathname !== INCOMING && !pathname.startsWith(`${INCOMING}/`)) return null;
      return parseInboundLane(params.get('lane')) === 'docked' ? 'docked' : 'pipeline';
    },
  },
  // Legacy family entry — deep-link / mode-resolution COMPATIBILITY ONLY.
  {
    // href is the Unbox surface (the receiving station's default); keep it in
    // sync so `getSidebarHref('receiving')` resolves there.
    id: 'receiving', label: 'Receiving', href: UNBOX, icon: STATION_PAGE_ICONS.receiving, kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view',
    children: [
      { id: 'incoming', label: 'Deliveries',      icon: RECEIVING_NAV_ICONS.incoming, to: () => ({ pathname: INCOMING, params: {} }) },
      { id: 'triage',   label: 'Arrival',      icon: RECEIVING_NAV_ICONS.triage,   to: () => ({ pathname: TRIAGE, params: {} }) },
      { id: 'receive',  label: 'Unbox',        icon: RECEIVING_NAV_ICONS.receive,  to: () => ({ pathname: UNBOX, params: {} }) },
      { id: 'pickup',   label: 'Local Pickup', icon: RECEIVING_NAV_ICONS.pickup,   to: () => ({ pathname: PICKUP, params: {} }) },
      { id: 'repair',   label: 'Repair Service', icon: RECEIVING_NAV_ICONS.repair, to: () => ({ pathname: REPAIR, params: {} }) },
    ],
    resolveChild: ({ pathname, params }) => {
      if (pathname === UNBOX || pathname.startsWith(`${UNBOX}/`)) return 'receive';
      if (pathname === TRIAGE || pathname.startsWith(`${TRIAGE}/`)) return 'triage';
      if (pathname === INCOMING || pathname.startsWith(`${INCOMING}/`)) return 'incoming';
      if (pathname === PICKUP || pathname.startsWith(`${PICKUP}/`)) return 'pickup';
      if (pathname === REPAIR || pathname.startsWith(`${REPAIR}/`)) return 'repair';
      const m = params.get('mode');
      if (m === 'pickup') return 'pickup';
      if (m === 'repair') return 'repair';
      if (m === 'incoming') return 'incoming';
      if (m === 'triage') return 'triage';
      return 'receive';
    },
  },
  // ── Sourcing (INBOUND lane — N4) ────────────────────────────────────────── `?mode=scout|watchlist`; bare /sourcing = the Queue (demand)…
  {
    id: 'sourcing', label: 'Sourcing', href: SOURCING, icon: Search, kind: 'domain', domainGroup: 'inbound', requires: 'sourcing.view',
    // Desk page chrome (2026-08-31):
    deskChrome: true,
    children: [
      // Each target used to null `q` and `status` by hand — and forgot `by` and `range`, so Scout's field toggle and the Analytics window leaked…
      { id: 'queue',     label: 'Queue',     icon: AlertCircle, to: () => ({ pathname: SOURCING, params: { mode: null } }) },
      { id: 'scout',     label: 'Scout',     icon: Search,      to: () => ({ pathname: SOURCING, params: { mode: 'scout' } }) },
      { id: 'watchlist', label: 'Watchlist', icon: Star,        to: () => ({ pathname: SOURCING, params: { mode: 'watchlist' } }) },
      { id: 'searches',  label: 'Searches',  icon: Clock,       to: () => ({ pathname: SOURCING, params: { mode: 'searches' } }) },
      { id: 'suppliers', label: 'Suppliers', icon: Link2,       to: () => ({ pathname: SOURCING, params: { mode: 'suppliers' } }) },
      // Sourcing master data (admin dissolution) — the ex-admin management
      // tabs, mounted by SourcingWorkspace.
      { id: 'models',        label: 'Models',        icon: Cpu,    requires: 'sourcing.view', to: () => ({ pathname: SOURCING, params: { mode: 'models' } }) },
      { id: 'compatibility', label: 'Compatibility', icon: Layers, requires: 'sourcing.view', to: () => ({ pathname: SOURCING, params: { mode: 'compatibility' } }) },
    ],
    resolveChild: ({ params }) => {
      const m = params.get('mode');
      if (m === 'scout' || m === 'lookup') return 'scout';
      if (m === 'watchlist') return 'watchlist';
      if (m === 'searches') return 'searches';
      if (m === 'suppliers') return 'suppliers';
      if (m === 'models') return 'models';
      if (m === 'compatibility') return 'compatibility';
      return 'queue';
    },
  },
  // ── FBA (Outbound lane, beside Shipping) ──────────────────────────────────
  {
    id: 'fba', label: 'FBA', href: OUTBOUND_MODE_PATHS.fba, icon: SHIPPING_NAV_ICONS.fba, kind: 'domain', domainGroup: 'fulfillment', requires: 'fba.view',
    railless: true,
    children: [
      { id: 'plan',    label: 'Plan',    icon: ClipboardList, to: () => ({ pathname: OUTBOUND_MODE_PATHS.fba, params: { mode: null, fbaMode: 'plan' } }) },
      { id: 'combine', label: 'Combine', icon: Package,       to: () => ({ pathname: OUTBOUND_MODE_PATHS.fba, params: { mode: null, fbaMode: null } }) },
      { id: 'shipped', label: 'Shipped', icon: PackageCheck,  to: () => ({ pathname: OUTBOUND_MODE_PATHS.fba, params: { mode: null, fbaMode: 'shipped' } }) },
    ],
    resolveChild: ({ params }) => {
      const v = String(params.get('fbaMode') || params.get('mode') || '').trim().toLowerCase();
      return v === 'plan' || v === 'shipped' ? v : 'combine';
    },
  },
  // ── Label intake (Outbound lane, beside Shipping) ───────────────────────── The V1 label-ingestion ledger.
  {
    id: 'label-intake', label: 'Label intake', href: SHIPPING_LABEL_INTAKE_PATH, icon: SHIPPING_NAV_ICONS.labels, kind: 'domain', domainGroup: 'fulfillment', requires: 'packing.review',
    railless: true,
  },
  // ── Shipping (Manage Shipping — Fulfillment) ────────────────────────────── Exceptions · Picking · To ship · Shipped.
  {
    id: 'outbound', label: 'Shipping', href: SHIPPING_ORDERS_PATH, icon: STATION_PAGE_ICONS.outbound, kind: 'domain', domainGroup: 'fulfillment', requires: 'shipping.view',
    // First adopter of desk page chrome (plan §2.2):
    deskChrome: true,
    // Rail-less, and now said out loud rather than derived from the line above (2026-08-31).
    railless: true,
    // Tab order (owner 2026-09-24): Exceptions · Picking · To ship · Shipped —
    // the same order the contextual sidebar paints from `DESK_VIEWS`.
    children: [
      // Exceptions is a PEER by the same test FBA passes:
      { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle,             requires: 'orders.view',  to: () => ({ pathname: SHIPPING_EXCEPTIONS_PATH, params: {} }) },
      // "Picking", not "Pending" (operator 2026-09-26): these orders are not in
      // limbo — they are waiting to be picked (PO paired · pick list).
      { id: 'shortage', label: 'Picking',   icon: AlertCircle,                  requires: 'orders.view', to: () => ({ pathname: SHIPPING_SHORTAGE_PATH, params: {} }) },
      { id: 'orders',   label: 'To ship',   icon: LayoutDashboard,              requires: 'orders.view', to: () => ({ pathname: SHIPPING_ORDERS_PATH, params: {} }) },
      // No `fba` child — FBA is a lane row now (see the docblock above).
      // `packing.view` because the archive IS the packer log: `/api/packerlogs`
      // already enforces it, and a tab that 403s is worse than an absent one.
      { id: 'shipped',  label: 'Shipped',   icon: PackageCheck,                 requires: 'packing.view', to: () => ({ pathname: SHIPPING_SHIPPED_PATH, params: {} }) },
    ],
    resolveChild: ({ pathname, params }) => {
      // Packing Review is a Scan Stations L1 — never a Shipping child highlight.
      if (pathname === REVIEW || pathname.startsWith(`${REVIEW}/`)) return null;
      // Label intake is a SIBLING row in the Outbound lane — it lights nothing
      // here rather than falling through to the `orders` catch-all.
      if (pathname === SHIPPING_LABEL_INTAKE_PATH || pathname.startsWith(`${SHIPPING_LABEL_INTAKE_PATH}/`)) return null;
      // Shipped is a path, so it resolves before the orders clause — the final
      // `return 'orders'` below is a catch-all, and without this the history
      // desk would light To ship on a page the operator is not on.
      if (
        pathname === SHIPPING_SHIPPED_PATH ||
        pathname.startsWith(`${SHIPPING_SHIPPED_PATH}/`)
      ) {
        return 'shipped';
      }
      if (
        pathname === SHIPPING_SHORTAGE_PATH ||
        pathname.startsWith(`${SHIPPING_SHORTAGE_PATH}/`)
      ) {
        return 'shortage';
      }
      // Exceptions is its own path and must resolve BEFORE the orders
      // catch-all below, or the workbench would light "To ship" — a tab for a
      // page the operator is not on, the same bug the Shipped clause fixes.
      if (
        pathname === SHIPPING_EXCEPTIONS_PATH ||
        pathname.startsWith(`${SHIPPING_EXCEPTIONS_PATH}/`)
      ) {
        return 'exceptions';
      }
      if (
        pathname === SHIPPING_ORDERS_PATH ||
        pathname.startsWith(`${SHIPPING_ORDERS_PATH}/`) ||
        pathname === DASHBOARD ||
        pathname.startsWith(`${DASHBOARD}/`)
      ) {
        // Support › Inquiries alias — Support's resolveChild owns the pin.
        if (params.get('context') === 'support') return null;
        // The pick list is a Picking view (`DESK_VIEWS` `pick`), not To ship.
        if (params.get(DESK_QUEUE_PARAM) === 'pick') return 'shortage';
        return 'orders';
      }
      // FBA is a SIBLING DESK in the Outbound lane, not a tab here, so its paths light nothing on this band rather than falling through to the…
      if (
        outboundModeFromPath(pathname) === 'fba' ||
        pathname === '/shipping/ready' ||
        pathname.startsWith('/shipping/ready/')
      ) {
        return null;
      }
      const m = params.get('mode');
      if (m === 'fba' || m === 'ready') return null;
      return 'orders';
    },
  },
  // ── Scan out (Scan Stations) ────────────────────────────────────────────── Mobile-first composer station:
  // (operator 2026-08-31 · docs/todo/scan-out-mobile-composer-HANDOFF.md).
  {
    id: 'scan-out', label: 'Scan out', href: OUTBOUND_MODE_PATHS['scan-out'], icon: SHIPPING_NAV_ICONS['scan-out'], kind: 'station', stationGroup: 'floor', requires: 'shipping.view',
    railless: true,
  },
  // ── Packing ───────────────────────────────────────────────────────────────
  // Standard-only / modeless. Legacy `?packMode=fragile|multi` deep-links may
  // still resolve in the pack surface; MasterNav no longer exposes those modes.
  {
    id: 'packer', label: 'Packing', href: PACK, icon: STATION_PAGE_ICONS.packer, kind: 'station', stationGroup: 'floor', requires: 'packing.view',
  },
  // Packing Review is Operations › Packing Review (desk KPI / queue) — not a Scan Station and not a Shipping L2.
  {
    id: 'products', label: 'Products', href: PRODUCTS, icon: Tags, kind: 'domain', domainGroup: 'catalog', requires: 'sku_stock.view',
    // Desk page chrome (2026-08-31): the children below are drawn as IN-PAGE
    // tabs by the Products desk, so the spine row stays a flat leaf.
    // NOT `railless` — this desk navigates by its context rail.
    deskChrome: true,
    children: [
      // REMOVED 2026-09-15, operator ruling — *"removing the products reference, the products kit parts, the products listing match … these are…
      { id: 'manuals', label: 'Manuals', icon: FileText, to: () => ({ pathname: PRODUCTS, params: { view: null } }) },
      { id: 'labels',  label: 'SKU Barcodes',  icon: Barcode,  to: () => ({ pathname: PRODUCTS, params: { view: 'labels' } }) },
      { id: 'pairing', label: 'Pairing', icon: Link2,    to: () => ({ pathname: PRODUCTS, params: { view: 'pairing' } }) },
      { id: 'qc',      label: 'QC Checklist', icon: Check,     to: () => ({ pathname: PRODUCTS, params: { view: 'qc' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      // Products is still the nav home for the Review station's PAIRING work (D10), so `/review?mode=pairing` lights Pairing here rather than…
      if (pathname === REVIEW || pathname.startsWith(`${REVIEW}/`)) {
        return params.get('mode') === 'pairing' ? 'pairing' : null;
      }
      return parseProductsView(params.get('view'));
    },
  },
  // ── Inventory ─────────────────────────────────────────────────────────────
  // `?mode=triage|pulse` or `?section=replenish`; default `ledger`.
  {
    id: 'inventory', label: 'Inventory', href: INVENTORY, icon: ShelvingUnit, kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view',
    // Desk page chrome (2026-08-31):
    // `railless` (operator 2026-09-15): the left context rail is gone on every
    deskChrome: true,
    railless: true,
    children: [
      // `open: null` on every switch so a selection (exception/unit id) from one mode never leaks into another's right pane.
      // `@/lib/nav/parked-tabs` (operator 2026-09-15 — the tabs that do not
      // Stock and SKU Exceptions lead the band (owner 2026-09-24: "stock and
      { id: 'stock', label: 'Stock', icon: Package, to: () => ({ pathname: `${INVENTORY}/stock`, params: {} }) },
      { id: 'sku-exceptions', label: 'SKU Exceptions', icon: AlertTriangle, to: () => ({ pathname: `${INVENTORY}/sku-exceptions`, params: {} }) },
      { id: 'ledger',    label: 'Ledger',    icon: Clipboard,  to: () => ({ pathname: INVENTORY, params: {} }) },
      { id: 'triage',    label: 'Tracking Exceptions', icon: Zap,        to: () => ({ pathname: `${INVENTORY}/triage`, params: {} }) },
      { id: 'pulse',     label: 'Pulse',     icon: TrendingUp, to: () => ({ pathname: `${INVENTORY}/pulse`, params: {} }) },
      { id: 'graph',     label: 'Graph',     icon: Layers,     to: () => ({ pathname: `${INVENTORY}/graph`, params: {} }) },
      { id: 'replenish', label: 'Replenish', icon: History,    to: () => ({ pathname: INVENTORY, params: { section: 'replenish' } }) },
      // Former Locations L1 (`/warehouse`) — nested Bin Tags · Bays · Rooms · Bins · Map.
      { id: 'locations', label: 'Locations', icon: Warehouse,  to: () => ({ pathname: `${INVENTORY}/locations`, params: {} }) },
      // Inventory master data (admin dissolution) — ex-admin management tabs,
      // sibling pages under the desk frame.
      { id: 'reason-codes', label: 'Reason Codes', icon: Tags, requires: 'sku_stock.manage', to: () => ({ pathname: `${INVENTORY}/reason-codes`, params: {} }) },
      { id: 'favorites',    label: 'Quick Picks',  icon: Star, requires: 'sku_stock.manage', to: () => ({ pathname: `${INVENTORY}/favorites`, params: {} }) },
      // Inventory rollout / drift board (ex-`/admin/inventory`).
      { id: 'health', label: 'Health', icon: Activity, requires: 'admin.view', to: () => ({ pathname: `${INVENTORY}/health`, params: {} }) },
    ],
    resolveChild: ({ pathname, params }) => {
      // Path-based modes (consistent with graph). Legacy `?mode=` still resolves.
      if (
        pathname.startsWith(`${INVENTORY}/locations`) ||
        pathname === '/warehouse' ||
        pathname.startsWith('/warehouse/')
      ) {
        return 'locations';
      }
      if (pathname.startsWith(`${INVENTORY}/stock`)) return 'stock';
      if (pathname.startsWith(`${INVENTORY}/sku-exceptions`)) return 'sku-exceptions';
      if (pathname.startsWith(`${INVENTORY}/graph`)) return 'graph';
      if (pathname.startsWith(`${INVENTORY}/triage`)) return 'triage';
      if (pathname.startsWith(`${INVENTORY}/pulse`)) return 'pulse';
      if (pathname.startsWith(`${INVENTORY}/reason-codes`)) return 'reason-codes';
      if (pathname.startsWith(`${INVENTORY}/favorites`)) return 'favorites';
      if (pathname.startsWith(`${INVENTORY}/health`)) return 'health';
      // The ex-admin operations desks wear the frame with NO tab lit — they are
      // reached from Health, and lighting Ledger would claim the operator is
      // somewhere they are not.
      if (
        pathname.startsWith(`${INVENTORY}/cycle-counts`) ||
        pathname.startsWith(`${INVENTORY}/holds`) ||
        pathname.startsWith(`${INVENTORY}/returns`) ||
        pathname.startsWith(`${INVENTORY}/bulk-allocate`) ||
        pathname.startsWith(`${INVENTORY}/throughput`) ||
        pathname.startsWith(`${INVENTORY}/events`)
      ) {
        return null;
      }
      if (params.get('section') === 'replenish') return 'replenish';
      const m = params.get('mode');
      if (m === 'triage') return 'triage';
      if (m === 'pulse') return 'pulse';
      return 'ledger';
    },
  },
  // Legacy Testing family — deep-link / CMD-GO / mode-resolution COMPATIBILITY ONLY.
  {
    id: 'tech', label: 'Testing', href: TECH, icon: STATION_PAGE_ICONS.tech, kind: 'station', stationGroup: 'floor', requires: 'tech.view',
    children: [
      { id: 'testing',  label: 'Quality Control', icon: TECH_NAV_ICONS.testing,  to: () => ({ pathname: TECH, params: { view: 'testing' } }) },
      { id: 'shipping', label: 'Picker',          icon: TECH_NAV_ICONS.shipping, to: () => ({ pathname: TECH, params: { view: null, ship: 'urgent' } }) },
    ],
    resolveChild: ({ params }) =>
      params.get('view') === 'testing' || params.get('view') === 'testing-history'
        ? 'testing'
        : 'shipping',
  },
  // Data Wipe (`/wipe`) is temporarily absent from master nav — revisit when the station UX is ready for general rollout.
  {
    id: 'support', label: 'Support', href: SUPPORT, icon: AlertCircle, kind: 'domain', domainGroup: 'support', requires: 'integrations.zendesk',
    // Desk page chrome (2026-08-31):
    // **To ship was REMOVED here (operator ruling 2026-08-31).** It was the one
    deskChrome: true,
    children: [
      {
        id: 'tickets',
        label: 'Tickets',
        icon: Inbox,
        to: () => ({
          pathname: SUPPORT,
          params: { mode: null },
        }),
      },
      {
        id: 'voicemail',
        label: 'Voicemail',
        icon: Voicemail,
        to: () => ({
          pathname: SUPPORT,
          params: { mode: 'voicemail' },
        }),
      },
      {
        id: 'calls',
        label: 'Calls',
        icon: Phone,
        to: () => ({
          pathname: SUPPORT,
          params: { mode: 'calls' },
        }),
      },
      {
        id: 'warranty',
        label: 'Warranty',
        icon: ShieldCheck,
        requires: 'warranty.view',
        to: () => ({
          pathname: SUPPORT,
          params: { mode: 'warranty' },
        }),
      },
      {
        id: 'issues',
        label: 'Issues',
        icon: MessageSquare,
        requires: 'support.issues.view',
        to: () => ({
          pathname: SUPPORT,
          params: { mode: 'issues' },
        }),
      },
    ],
    resolveChild: ({ params }) => {
      const m = params.get('mode');
      // Legacy `?mode=orders` deep links land on Tickets now that To ship is
      // gone from this desk — the queue lives at /shipping/orders.
      if (m === 'voicemail') return 'voicemail';
      if (m === 'calls') return 'calls';
      if (m === 'warranty') return 'warranty';
      if (m === 'issues') return 'issues';
      return 'tickets';
    },
  },
  // ── Automations (map L1) ────────────────────────────────────────────────── Studio is an ordinary map row (2026-08-29).
  {
    id: 'studio', label: 'Automations', href: '/studio', icon: Workflow,
    kind: 'main', mainGroup: 'studio', requires: 'studio.view',
    children: [
      { id: 'graph',   label: 'Studio',  icon: Share2,  to: () => ({ pathname: '/studio' }) },
      // Rules (2026-09-23 ruling) — the first-principles automations display:
      { id: 'rules',   label: 'Rules',   icon: Zap,     to: () => ({ pathname: '/studio/automations' }) },
      { id: 'catalog', label: 'Catalog', icon: Layers,  to: () => ({ pathname: '/studio/catalog' }) },
    ],
    resolveChild: ({ pathname }) => {
      if (pathname === '/studio/catalog' || pathname.startsWith('/studio/catalog/')) return 'catalog';
      if (pathname === '/studio/automations' || pathname.startsWith('/studio/automations/')) return 'rules';
      return 'graph';
    },
  },
  // Admin is DISSOLVED — `/admin` is a redirect table (`src/app/admin/page.tsx`),
  // not a page with modes. Do not reintroduce an admin entry here.
];

/** Lookup a page's nav entry (children + resolver) by its route/page id. */
export function getSidebarPageNav(pageId: string): SidebarPageNav | undefined {
  return SIDEBAR_PAGE_NAV.find((page) => page.id === pageId);
}

/** Ordered first-class Scan Stations benches — the same flat map MasterNav lists under the Stations disclosure and the header page switcher… */
export function floorStationPages(
  pages?: readonly SidebarPageNav[],
): SidebarPageNav[] {
  const source =
    pages ??
    SIDEBAR_PAGE_NAV.filter((p) => APP_SIDEBAR_NAV.some((item) => item.id === p.id));
  const byId = new Map(source.map((p) => [p.id, p]));
  const out: SidebarPageNav[] = [];
  for (const item of APP_SIDEBAR_NAV) {
    if (item.kind !== 'station' || item.stationGroup !== 'floor') continue;
    const page = byId.get(item.id);
    if (page?.kind === 'station' && page.stationGroup === 'floor') out.push(page);
  }
  return out;
}

/** Ordered first-class station pages that belong to a subgroup. */
export function stationSubgroupMembers(
  subgroup: StationSubgroupId,
  pages?: readonly SidebarPageNav[],
): SidebarPageNav[] {
  const source =
    pages ??
    SIDEBAR_PAGE_NAV.filter((p) => APP_SIDEBAR_NAV.some((item) => item.id === p.id));
  return source.filter(
    (p) => p.kind === 'station' && p.stationSubgroup === subgroup,
  );
}

/** **THE ONE CHILD FUNNEL.** Drop every child page the operator has no DOOR to: */
export function filterPageChildren(
  page: SidebarPageNav,
  permissions?: ReadonlySet<string>,
): SidebarPageNav {
  if (!page.children) return page;
  const children = page.children.filter(
    (child) =>
      !isTabParked(page.id, child.id) &&
      (!child.requires || (permissions?.has(child.requires) ?? false)),
  );
  return children.length === page.children.length ? page : { ...page, children };
}

/** False when a page DECLARED children and permission filtering removed every one — the page is unreachable, so it must be absent rather… */
export function isSidebarPageReachable(page: SidebarPageNav): boolean {
  return page.children === undefined || page.children.length > 0;
}

/** Canonical href for a page id. */
export function getSidebarHref(pageId: string): string | null {
  return (
    getSidebarPageNav(pageId)?.href ??
    APP_SIDEBAR_NAV.find((item) => item.id === pageId)?.href ??
    null
  );
}

/** Apply a mode's `ChildNavTarget` to the current location, returning the next `{ pathname, search }`. */
export function applyChildTarget(
  current: { pathname: string; params: Pick<URLSearchParams, 'toString'> },
  target: ChildNavTarget,
): { pathname: string; search: string } {
  const params = new URLSearchParams(current.params.toString());
  for (const [key, value] of Object.entries(target.params ?? {})) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const spec = routeParamsFor(target.pathname);
  if (!spec) return { pathname: target.pathname, search: params.toString() };

  // Rule 1 — CONSTRUCT, do not copy.
  const next = new URLSearchParams();
  const staff = params.get('staff') ?? params.get('staffId');
  if (staff) next.set('staff', staff);
  for (const [key, value] of Object.entries(target.params ?? {})) {
    if (value !== null) next.set(key, value);
  }
  return { pathname: target.pathname, search: parseRouteParams(spec, next).toString() };
}

/** True when a page draws its own child pages as in-page tabs ({@link SidebarPageNav.deskChrome}) — the spine must not drill it and the… */
export function hasDeskPageChrome(page: SidebarPageNav | null | undefined): boolean {
  return Boolean(page?.deskChrome) && (page?.children?.length ?? 0) > 1;
}

/**
 * Read the active mode id for a page from a location. Returns `null` for
 * single-surface pages (no modes). Mirrors each panel's own derivation.
 */
export function resolveSidebarChild(pageId: string, loc: ChildLocation): string | null {
  const page = getSidebarPageNav(pageId);
  if (!page?.resolveChild) return null;
  return page.resolveChild(loc);
}
