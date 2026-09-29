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
  Download,
  List,
  Inbox,
  Layers,
  LayoutDashboard,
  Link2,
  ListChecks,
  MessageSquare,
  Monitor,
  Package,
  PackageCheck,
  PackageOpen,
  Printer,
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
  TicketHelp,
  TrendingUp,
  User,
  Workflow,
  Zap,
  Warehouse,
  ShelvingUnit,
  StationWalkIn,
  Phone,
  Voicemail,
  Upload,
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
import { QC_LABELS_PATH } from '@/lib/labels/qc-label-views';
import { PRINT_STATION_PATH, PRINT_STATION_FNSKU_PARAM, PRINT_STATION_VIEW_PARAM } from '@/lib/print-station/fnsku';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { DESK_QUEUE_PARAM } from '@/lib/outbound/desk-views';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import { FBA_MODE_PARAM, resolveFbaModeFromSearchParams } from '@/lib/fba/fba-modes';
import {
  EXCEPTIONS_PATH,
  EXCEPTION_DOMAINS,
  EXCEPTION_DOMAIN_LABEL,
  EXCEPTION_DOMAIN_PARAM,
  EXCEPTION_KINDS,
  EXCEPTION_KIND_PARAM,
  EXCEPTION_KIND_SPEC,
  EXCEPTION_RECORD_PARAM,
  exceptionKindsOf,
  parseExceptionDomain,
  parseExceptionKind,
  type ExceptionDomain,
  type ExceptionKind,
} from '@/lib/exceptions/types';
import { EXCEPTION_KIND_PERMISSION } from '@/lib/exceptions/permissions';

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
  | 'pick'
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

/** Main category ids under the spine — Operations (parked). Automations left the lanes for a top row (2026-09-27). */
export type MainGroupId = 'monitor';

/** Spine list imports this — never hard-code the label in the render path. */
export const MAIN_GROUPS = [
  { id: 'monitor', label: 'Monitor', icon: ChartPie },
] as const satisfies ReadonlyArray<{
  id: MainGroupId;
  label: string;
  icon: SidebarIconComponent;
}>;

/** Optional peer tags on floor benches (Arrival · Unbox / Repair Service / Quality Control). */
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
  domainLane('sales'),
  domainLane('inbound'),
  domainLane('fulfillment'),
  domainLane('inventory'),
  domainLane('catalog'),
  domainLane('support'),
  MAIN_GROUPS[0], // Operations (monitor)
] as const;

export type SpineSectionId = (typeof SPINE_SECTIONS)[number]['id'];

/** Distinct station ink shared by the parent switcher and its `G` key hint. */
export const SCAN_STATION_TONES = {
  triage: 'text-cyan-600',
  receive: 'text-emerald-600',
  repair: 'text-orange-600',
  testing: 'text-violet-600',
  'ready-to-pack': 'text-blue-600',
  packer: 'text-amber-600',
  'scan-out': 'text-rose-600',
} as const;

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
   * The icon's ink where the page is a lane MODE (the contextual sidebar's
   * parent tier, its key hint, the `G` strip): the page reads in colour
   * before its word. Omit for a muted icon.
   */
  tone?: string;
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
  /**
   * One secondary line under the label where the name alone misleads — e.g.
   * FBM is Amazon's acronym but covers every channel we ship ourselves.
   */
  description?: string;
  /** `kind: 'top'` only. */
  spineBand?: boolean;
  /**
   * Keep a command-palette `top` item in the draggable map order instead of
   * the fixed pin band.
   */
  spineOrderable?: boolean;
  /**
   * Keep this parent row in the fixed utility band at the absolute bottom of
   * the sidebar, below Scan Stations and outside staff drag ordering.
   */
  spineBottom?: boolean;
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
  '/pick',
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
  // Top map rows — Chat → Daily → Automations → Exceptions → Media Library. Chat leads the
  // page map and the ⌘K pin (operator 2026-09-27); `/ai-chat` → SessionSurface,
  // the ONE assistant door. Automations sits right under Chat, a top row rather
  // than the last lane (operator 2026-09-27: a more prominent action; href
  // stays /studio).
  { id: 'ai-chat',           label: 'Chat',           href: '/ai-chat',            icon: MessageSquare,   kind: 'top', requires: 'assistant.chat' },
  { id: 'home',              label: 'Daily',           href: '/',                   icon: ListChecks,      kind: 'top' },
  { id: 'studio',            label: 'Automations',    href: '/studio',             icon: Workflow,        kind: 'top', requires: 'studio.view' },
  // Exceptions (owner 2026-09-28): every category's blockers in one hub. No
  // single `requires` — the row shows while ANY kind child survives the child
  // funnel (`getSidebarNavItems` → `hasChildDoor`), i.e. the caller can see
  // any exception source.
  { id: 'exceptions',        label: 'Exceptions',     href: EXCEPTIONS_PATH,       icon: AlertTriangle,   kind: 'top', keywords: ['exceptions', 'blockers', 'held orders', 'missing pairs', 'bin errors', 'tracking exceptions', 'claim', 'short', 'unfound'] },
  // Print station (owner 2026-09-29): a parent-level page for printing to ANY computer in the org — first FNSKU labels,
  // found from the contextual sidebar's Find and sent silently to the print station at a packer's table.
  { id: 'print-station',     label: 'Print station',  href: PRINT_STATION_PATH,    icon: Printer,         kind: 'top', spineBottom: true, requires: 'print.label', keywords: ['print', 'printer', 'reprint', 'fnsku', 'fba label', 'amazon label', 'unit label', 'print station', 'send to station'] },
  { id: 'search',            label: 'Search',         href: '/search',             icon: Search,          kind: 'top', spineBand: false },
  { id: 'ops-photos',        label: 'Media Library',  href: '/ops/photos',         icon: Images,          kind: 'top', requires: 'photos.view', keywords: ['photos', 'photo library', 'images', 'assets', 'gallery'] },
  // Plans — live master-plan console (Home forge). Same landing as `/forge`.
  { id: 'plans-live',        label: 'Plans',          href: '/?mode=forge',        icon: Zap,             kind: 'top', spineBand: false, requires: 'operations.plans.view' },
  // NO standalone Tasks row.
  // (`/?mode=tasks`, see SIDEBAR_PAGE_NAV) — operator 2026-09-22: *"focus on
  { id: 'settings',          label: 'Settings',    href: '/settings',           icon: Settings,        kind: 'top', spineBand: false },
  // Monitor — TV / observe-only Operations Live (+ Analytics / History / …).
  { id: 'operations',        label: 'Operations',  href: '/operations',         icon: Monitor,         kind: 'main', mainGroup: 'monitor', requires: 'operations.view' },
  // The import record (`/operations/imports`): what each import brought in, order by order.
  // Its own gate — orders.view, the list endpoints' — so order staff reach it without operations.view.
  { id: 'imports',           label: 'Imports',     href: '/operations/imports', icon: Download,        kind: 'main', mainGroup: 'monitor', requires: 'orders.view' },
  // Reports — DATED, per-entity, exportable tables (Staff day · Bin utilization · Velocity · Dead stock).
  // **A PARENT-LEVEL row, not a Monitor member** (operator 2026-09-15:
  { id: 'reports',            label: 'Reports',     href: '/reports',            icon: BarChart3,       kind: 'top', spineFlat: true, spineBottom: true, requires: 'operations.view' },
  // Scan Stations — scan-first benches (Arrival / Unbox / Repair
  // Service / Quality Control / Ready to Pack / Packing / Scan out).
  { id: 'triage',            label: 'Arrival',     href: '/triage',             icon: RECEIVING_NAV_ICONS.triage,  tone: SCAN_STATION_TONES.triage, kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view' },
  { id: 'receive',           label: 'Unbox',       href: '/unbox',              icon: RECEIVING_NAV_ICONS.receive, tone: SCAN_STATION_TONES.receive, kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view' },
  { id: 'pickup',            label: 'Local Pickup', href: '/pickup',            icon: RECEIVING_NAV_ICONS.pickup,  kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view' },
  { id: 'repair',            label: 'Repair Service', href: '/repair',          icon: RECEIVING_NAV_ICONS.repair,  tone: SCAN_STATION_TONES.repair, kind: 'station', stationGroup: 'floor', stationSubgroup: 'walk-in', requires: 'receiving.view' },
  // Quality Control (`/test`) and the Picker desk (`/pick`) are separate
  // first-class Scan Stations (owner 2026-09-27). Picking is not a testing bench,
  // so the Picker row carries no `testing` subgroup.
  { id: 'testing',           label: 'Quality Control', href: '/test',             icon: TECH_NAV_ICONS.testing,  tone: SCAN_STATION_TONES.testing, kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view' },
  { id: 'ready-to-pack',     label: 'Picker',          href: '/pick', icon: TECH_NAV_ICONS.shipping, tone: SCAN_STATION_TONES['ready-to-pack'], kind: 'station', stationGroup: 'floor', requires: 'picking.view' },
  // Points at the first-class Pack surface (`/pack`) so the primary nav lands on
  // the canonical URL without a redirect hop. Route key still resolves to
  // 'packer' (reuses the packer panel), so the item stays active on /pack + /packer.
  { id: 'packer',            label: 'Packing',     href: '/pack',               icon: STATION_PAGE_ICONS.packer, tone: SCAN_STATION_TONES.packer, kind: 'station', stationGroup: 'floor', requires: 'packing.view' },
  // Scan out stays on the floor as a modeless dock-confirm station. Labels /
  // Amazon Prep live under Shipping. Route key still resolves to 'outbound'
  // for panel chrome across every shipping mode.
  { id: 'scan-out',          label: 'Scan out',    href: OUTBOUND_MODE_PATHS['scan-out'], icon: SHIPPING_NAV_ICONS['scan-out'], tone: SCAN_STATION_TONES['scan-out'], kind: 'station', stationGroup: 'floor', requires: 'shipping.view' },
  // ── Inbound ─────────────────────────────────────────────────────────────── The pointer-driven COUNTERPART of the receiving benches:
  // **Faced `Deliveries`, not `Inbound` (operator 2026-09-14).** This row sits
  { id: 'incoming',          label: 'Deliveries', href: '/incoming',           icon: RECEIVING_NAV_ICONS.incoming, kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view', keywords: ['inbound', 'incoming', 'arrivals', 'on the way', 'cartons', 'deliveries'] },
  // ── Catalog ─────────────────────────────────────────────────────────────── Manage Products.
  { id: 'products',          label: 'Products',    href: '/products',           icon: Tags,            kind: 'domain', domainGroup: 'catalog', requires: 'sku_stock.view' },
  // ── Inventory ─────────────────────────────────────────────────────────────
  // Physical stock + Locations. Named "Warehouse", not "Inventory": it is a MODE of the Inventory lane
  // and a parent and a child never share a name (nav-name law, 2026-09-28).
  { id: 'inventory',         label: 'Warehouse',   href: '/inventory',          icon: ShelvingUnit,    kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view', keywords: ['inventory', 'stock', 'ledger', 'locations', 'replenish'] },
  // QC labels rides the Inventory lane beside Inventory (owner 2026-09-28): the per-unit QC / pre-box label the picker scans.
  { id: 'qc-labels',         label: 'QC labels',   href: QC_LABELS_PATH,        icon: ScanBarcode,     kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view', keywords: ['qc label', 'prebox label', 'pre-box', 'unit label', 'reprint', 'serial label'] },
  // Sourcing rides the INBOUND lane (N4, operator 2026-09-14): demand → PO →
  // on the way → received is one direction. The 2026-08-03 ruling only kept it
  // out of *Inventory*; the row itself is unchanged.
  { id: 'sourcing',          label: 'Sourcing',    href: '/sourcing',           icon: ShoppingCart,    kind: 'domain', domainGroup: 'inbound', requires: 'sourcing.view' },
  // Locations folded under Inventory L2 (`/inventory/locations`) — P4 condensation.
  // FBM (owner 2026-09-28): every order WE store, pack and ship, on any channel —
  // the clean split from FBA, where Amazon ships. Same page id / routes as the
  // old "Shipping" desk; the old name still finds it in ⌘K.
  { id: 'outbound',          label: 'FBM',         href: SHIPPING_ORDERS_PATH, icon: STATION_PAGE_ICONS.outbound,  kind: 'domain', domainGroup: 'fulfillment', requires: 'shipping.view', description: 'Fulfilled by merchant · all channels', keywords: ['shipping', 'ship', 'fulfilled by merchant', 'merchant fulfilled', 'mfn', 'to ship', 'allocate'] },
  // FBA rides the Fulfillment lane beside FBM (operator 2026-09-14).
  { id: 'fba',               label: 'FBA',         href: OUTBOUND_MODE_PATHS.fba, icon: SHIPPING_NAV_ICONS.fba, kind: 'domain', domainGroup: 'fulfillment', requires: 'fba.view', description: 'Fulfilled by Amazon' },
  // Labels & docs rides the Outbound lane beside Shipping and FBA: label printing + document intake (renamed from Label intake 2026-09-27).
  { id: 'label-intake',      label: 'Labels & docs', href: SHIPPING_LABEL_INTAKE_PATH, icon: SHIPPING_NAV_ICONS.labels, kind: 'domain', domainGroup: 'fulfillment', requires: 'packing.review', keywords: ['labels', 'label intake', 'label pdf', 'print labels', 'print all', 'reprint', 'packing slip', 'manual', 'documents', 'paperwork', 'quarantine', 'tracking', 'ingestion'] },
  // ── Sales ───────────────────────────────────────────────────────────────── Own root (D4) — front-desk history, not a fulfillment lane.
  { id: 'sales',             label: 'Sales',       href: `/dashboard?mode=${DASHBOARD_SALES_MODE}`, icon: SalesPrice, kind: 'domain', domainGroup: 'sales', requires: 'dashboard.view' },
  // Counter is a Sales child (`SIDEBAR_PAGE_NAV`), not its own L1 row.
  { id: 'support',           label: 'Support',     href: '/support',            icon: AlertCircle,     kind: 'domain', domainGroup: 'support', requires: 'integrations.zendesk' },
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
    items = items.filter((item) => (!item.requires || permissions.has(item.requires)) && hasChildDoor(item.id, permissions));
  }
  items = items.filter((item) => !item.sandboxOnly || organizationEnvironment === 'sandbox');
  // THE MOBILE-FIRST GATE (operator 2026-09-14):
  // THE MOBILE-FIRST GATE (operator 2026-09-14): a lane the phone cannot run
  items = items.filter((item) => isLaneVisible(spineSectionIdForPage(item) ?? ''));
  return items;
}

/**
 * A page that DECLARES children is a door only while one of them survives the
 * child funnel ({@link filterPageChildren}): its gate is "any child's". This is
 * how Exceptions — one child per source kind, each gated by that source's
 * permission — shows to anyone who can see ANY exception source, without a
 * second permission list on the row.
 */
function hasChildDoor(pageId: string, permissions: ReadonlySet<string>): boolean {
  const page = getSidebarPageNav(pageId);
  return !page || isSidebarPageReachable(filterPageChildren(page, permissions));
}

/** Route keys that render a station intake column. Operational rows stay in the workspace. */
const STATION_SURFACE_ROUTE_KEYS = new Set<SidebarRouteKey>([
  'receiving',
  'tech',
  'pick',
  'packer',
  'review',
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
  // Support is always rail-less. Ticket and order records belong in the
  // workspace; the contextual navigation already owns its views and controls.
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    return true;
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
  'studio',
  // `settings` DROPPED 2026-09-10 — Pattern E card landing + /settings/me.
  // Roles/Access still need their picker rails; those paths are special-cased
  // in hasSidebarContextPanel below (the route key stays `settings`).
  // Audit and FBA records render in their central workspaces. FBA scan intake
  // is declared through NAV_PAGE_DECLS and painted by ContextualSidebar.
  // `inventory` DROPPED 2026-09-15 — operator:
  // `sourcing` DROPPED 2026-09-28 — its filters and views live in the contextual
  // sidebar; the Models / Compatibility picker moved into the stage.
  // `walk-in` dropped — `/walk-in` is a redirect shell; Sales owns one contextual sidebar on `/dashboard`.
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
  // Local Pickup is the Inbound lane's receiving ledger; the route still
  // mounts the shared receiving right pane.
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
  // `/test` is the Quality Control bench; it resolves to the `tech` key (legacy `/tech` too).
  if (pathname === '/test' || pathname.startsWith('/test/')) return 'tech';
  if (pathname === '/tech' || pathname.startsWith('/tech/')) return 'tech';
  // `/pick` is the Picker desk (scan band + shipping workspace).
  if (pathname === '/pick' || pathname.startsWith('/pick/')) return 'pick';
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
  if (pathname === EXCEPTIONS_PATH || pathname.startsWith(`${EXCEPTIONS_PATH}/`)) return 'exceptions';
  if (pathname === PRINT_STATION_PATH || pathname.startsWith(`${PRINT_STATION_PATH}/`)) return 'print-station';
  // Quality Control owns `/test` (legacy `/tech`); the Picker desk owns `/pick`.
  // A stale `?view=` on `/test` is ignored — the bench has one mode.
  if (
    pathname === '/test' ||
    pathname.startsWith('/test/') ||
    pathname === '/tech' ||
    pathname.startsWith('/tech/')
  ) {
    return 'testing';
  }
  if (pathname === QC_LABELS_PATH || pathname.startsWith(`${QC_LABELS_PATH}/`)) return 'qc-labels';
  if (pathname === IMPORTS || pathname.startsWith(`${IMPORTS}/`)) return 'imports';
  if (pathname === '/pick' || pathname.startsWith('/pick/')) return 'ready-to-pack';
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
  return item.kind === 'top' && item.spineBand !== false && item.spineOrderable !== true && item.spineBottom !== true;
}

/** Fixed utility rows rendered after every lane and Scan Station. */
export function isSpineBottomRow(item: SidebarNavItem): boolean {
  return item.kind === 'top' && item.spineBottom === true;
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

/** Section ids that belong in the Workspaces family (not Scan Stations). */
export function isDeskSpineSection(id: SpineSectionId | null): boolean {
  if (!id || id === 'floor') return false;
  return true;
}

/** The Workspaces lanes, in {@link SPINE_SECTIONS} order — Sales → Receiving → Fulfillment → Inventory → Products → Support → Operations. */
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
  // The import record is order data: the list endpoints' gate, not Operations'. Must beat `/operations`.
  { prefix: '/operations/imports', permission: 'orders.view' },
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
  // `/test` is the Quality Control bench (legacy `/tech`).
  { prefix: '/test',               permission: 'tech.view' },
  { prefix: '/tech',               permission: 'tech.view' },
  // `/pick` is the Picker desk; `/m/pick` is its phone twin.
  { prefix: '/pick',               permission: 'picking.view' },
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
  /**
   * Gate on ANY of these permissions (beside `requires`, which must also
   * hold): a child that aggregates siblings gated differently — Exceptions'
   * All shows to whoever can see any one source kind.
   */
  requiresAny?: readonly string[];
  /* There is deliberately NO `parked` field here. */
}

export type SidebarPageNav = SidebarNavItem & {
  /** This page's child pages. Omitted for single-surface pages. */
  children?: SidebarChildPage[];
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
// Quality Control's first-class surface route (operator-surfaces refactor Phase 8).
const TECH = '/test';
// The Picker desk — split from `/test` when Picking and QC became separate stations (owner 2026-09-27).
const PICK = '/pick';
const SUPPORT = '/support';
// Packing graduated to its own first-class surface route (`/pack`,
// operator-surfaces refactor Phase 7); its modes navigate there. Legacy
// `/packer` still resolves (proxy redirect + shared page).
const PACK = '/pack';
const REVIEW = '/review';
// The import record (`src/lib/imports/params.ts` IMPORTS_PATH).
const IMPORTS = '/operations/imports';

/** Each exception kind's nav glyph — the icon of the surface its source lives on. */
const EXCEPTION_KIND_ICONS: Readonly<Record<ExceptionKind, SidebarIconComponent>> = {
  fbm: STATION_PAGE_ICONS.outbound,
  labels: SHIPPING_NAV_ICONS.labels,
  paperwork: FileText,
  pairs: Link2,
  bins: Warehouse,
  tracking: Barcode,
  claim: AlertCircle,
  short: PackageOpen,
  unfound: Search,
};

/** Each exception domain's nav glyph — its lane's (Receiving is Inbound's). */
const EXCEPTION_DOMAIN_ICONS: Readonly<Record<ExceptionDomain, SidebarIconComponent>> = {
  fulfillment: domainLane('fulfillment').icon,
  inventory: domainLane('inventory').icon,
  receiving: domainLane('inbound').icon,
};

export const SIDEBAR_PAGE_NAV: SidebarPageNav[] = [
  // ── Daily (was Home) ──────────────────────────────────────────────────────
  {
    id: 'home', label: 'Daily', href: '/', icon: ListChecks, kind: 'top',
    children: [
      { id: 'all', label: 'All', icon: List, to: () => ({ pathname: '/', params: { tab: null } }) },
      { id: 'checklist', label: 'Checklist', icon: Check, to: () => ({ pathname: '/', params: { tab: 'checklist', scope: null } }) },
      { id: 'task', label: 'Tasks', icon: ClipboardList, to: () => ({ pathname: '/', params: { tab: 'task' } }) },
      { id: 'ticket', label: 'Tickets', icon: Phone, to: () => ({ pathname: '/', params: { tab: 'ticket' } }) },
      { id: 'task_ticket', label: 'Tasks + tickets', icon: Layers, to: () => ({ pathname: '/', params: { tab: 'task_ticket' } }) },
    ],
    resolveChild: ({ params }) => {
      const tab = params.get('tab');
      return tab === 'checklist' || tab === 'task' || tab === 'ticket' || tab === 'task_ticket' ? tab : 'all';
    },
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
    // NOT `railless` — this desk navigates by its context rail.
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
  // ── Imports ─────────────────────────────────────────────────────────────── The import record (handoff import-history §5):
  // Runs (bare) · Orders (`?view=rows`, one row per order an import touched). `?run=` opens a run's record.
  {
    id: 'imports', label: 'Imports', href: IMPORTS, icon: Download, kind: 'main', mainGroup: 'monitor', requires: 'orders.view',
    // Rail-less (owner 2026-09-28): the contextual sidebar is its one left
    // column — never the Operations live-feed panel beside it.
    railless: true,
    children: [
      { id: 'runs', label: 'Runs',   icon: History, to: () => ({ pathname: IMPORTS, params: { view: null } }) },
      { id: 'rows', label: 'Orders', icon: List,    to: () => ({ pathname: IMPORTS, params: { view: 'rows' } }) },
    ],
    resolveChild: ({ params }) => (params.get('view') === 'rows' ? 'rows' : 'runs'),
  },
  // ── Reports ──────────────────────────────────────────────────────────────── Parent in the page map; report types are its contextual children.
  {
    // `kind: 'top'` must match the APP_SIDEBAR_NAV twin above — the two
    // registries are kept in lockstep, and a `main`/`top` split would put the
    // row in the lane band on one code path and above it on the other.
    id: 'reports', label: 'Reports', href: '/reports', icon: BarChart3, kind: 'top', spineBottom: true, requires: 'operations.view',
    children: [
      { id: 'staff-day',   label: 'Staff day',       icon: ClipboardList, to: () => ({ pathname: '/reports', params: { tab: null } }) },
      { id: 'packer-day',  label: 'Packer day',      icon: Package,       to: () => ({ pathname: '/reports', params: { tab: 'packer' } }) },
      { id: 'utilization', label: 'Bin utilization', icon: BarChart3,     to: () => ({ pathname: '/reports', params: { tab: 'utilization' } }) },
      { id: 'velocity',    label: 'Velocity (30d)',  icon: TrendingUp,    to: () => ({ pathname: '/reports', params: { tab: 'velocity' } }) },
      { id: 'dead-stock',  label: 'Dead stock',      icon: FileText,      to: () => ({ pathname: '/reports', params: { tab: 'dead' } }) },
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
  // ── Media Library ───────────────────────────────────────────────────────── Source scopes are page views; image type remains an advanced filter.
  {
    id: 'ops-photos', label: 'Media Library', href: '/ops/photos', icon: Images, kind: 'top', requires: 'photos.view',
    children: [
      { id: 'all', label: 'All media', icon: Images, to: () => ({ pathname: '/ops/photos', params: { sourceScope: null, imageType: null } }) },
      { id: 'unboxing', label: 'Unboxing', icon: PackageOpen, to: () => ({ pathname: '/ops/photos', params: { sourceScope: 'unboxing', imageType: null } }) },
      { id: 'local_pickup', label: 'Local pickups', icon: SalesModeCounter, to: () => ({ pathname: '/ops/photos', params: { sourceScope: 'local_pickup', imageType: null } }) },
      { id: 'packing', label: 'Packing', icon: Package, to: () => ({ pathname: '/ops/photos', params: { sourceScope: 'packing', imageType: null } }) },
      { id: 'repair', label: 'Repair services', icon: Settings, to: () => ({ pathname: '/ops/photos', params: { sourceScope: 'repair', imageType: null } }) },
      { id: 'claims', label: 'Claims', icon: TicketHelp, to: () => ({ pathname: '/ops/photos', params: { sourceScope: 'claims', imageType: null } }) },
      { id: 'outbound', label: 'Outbound', icon: Share2, to: () => ({ pathname: '/ops/photos', params: { sourceScope: 'outbound', imageType: null } }) },
    ],
    resolveChild: ({ params }) => {
      const scope = params.get('sourceScope');
      return scope === 'unboxing' || scope === 'local_pickup' || scope === 'packing' || scope === 'repair' || scope === 'claims' || scope === 'outbound'
        ? scope
        : 'all';
    },
  },
  // ── Exceptions ─────────────────────────────────────────────────────────── The global hub (owner 2026-09-28): its own
  // MODES (`NAV_PAGE_DECLS.exceptions.modes`) — one child per DOMAIN (the mode
  // card's dropdown), then one per source KIND (`src/lib/exceptions/types.ts`)
  // whose `group` is its domain's id (the views under the card). The bare page
  // is All (no child). Each kind carries its source's permission and each
  // domain ANY of its kinds' (`requiresAny`); the page has no `requires` of
  // its own and shows while a child survives (`hasChildDoor`). A kind's
  // target keeps its domain, so the mode stays.
  {
    id: 'exceptions', label: 'Exceptions', href: EXCEPTIONS_PATH, icon: AlertTriangle, kind: 'top',
    railless: true,
    children: [
      ...EXCEPTION_DOMAINS.map((domain) => ({
        id: domain,
        label: EXCEPTION_DOMAIN_LABEL[domain],
        icon: EXCEPTION_DOMAIN_ICONS[domain],
        requiresAny: [...new Set(exceptionKindsOf(domain).map((kind) => EXCEPTION_KIND_PERMISSION[kind]))],
        to: () => ({
          pathname: EXCEPTIONS_PATH,
          params: { [EXCEPTION_DOMAIN_PARAM]: domain, [EXCEPTION_KIND_PARAM]: null, [EXCEPTION_RECORD_PARAM]: null },
        }),
      })),
      ...EXCEPTION_KINDS.map((kind) => ({
        id: kind,
        label: EXCEPTION_KIND_SPEC[kind].label,
        icon: EXCEPTION_KIND_ICONS[kind],
        requires: EXCEPTION_KIND_PERMISSION[kind],
        group: EXCEPTION_KIND_SPEC[kind].domain,
        to: () => ({
          pathname: EXCEPTIONS_PATH,
          params: {
            [EXCEPTION_DOMAIN_PARAM]: EXCEPTION_KIND_SPEC[kind].domain,
            [EXCEPTION_KIND_PARAM]: kind,
            [EXCEPTION_RECORD_PARAM]: null,
          },
        }),
      })),
    ],
    resolveChild: ({ params }) =>
      parseExceptionKind(params.get(EXCEPTION_KIND_PARAM)) ?? parseExceptionDomain(params.get(EXCEPTION_DOMAIN_PARAM)),
  },
  // ── Print station ─────────────────────────────────────────────────────────── Views grouped by print kind; FNSKU labels
  // first (owner 2026-09-29): All (bare URL) · Reprinted. Find (`?q=`) narrows the FBA catalog; `?fnsku=` is the open label.
  // The group heading is never the page's name (nav-name law).
  {
    id: 'print-station', label: 'Print station', href: PRINT_STATION_PATH, icon: Printer, tone: 'text-sky-600', kind: 'top', spineBottom: true, requires: 'print.label',
    railless: true,
    children: [
      { id: 'fnsku', label: 'All FNSKUs', icon: ScanBarcode, group: 'FNSKU labels', to: () => ({ pathname: PRINT_STATION_PATH, params: { [PRINT_STATION_VIEW_PARAM]: null, [PRINT_STATION_FNSKU_PARAM]: null } }) },
      { id: 'fnsku-reprinted', label: 'Reprinted', icon: History, group: 'FNSKU labels', to: () => ({ pathname: PRINT_STATION_PATH, params: { [PRINT_STATION_VIEW_PARAM]: 'reprinted', [PRINT_STATION_FNSKU_PARAM]: null } }) },
    ],
    resolveChild: ({ params }) => (params.get(PRINT_STATION_VIEW_PARAM) === 'reprinted' ? 'fnsku-reprinted' : 'fnsku'),
  },
  // ── Receiving family ─────── Arrival / Unbox / Repair are physical stations;
  // Local Pickup is a first-class mode of the Inbound desk lane.
  {
    id: 'triage', label: 'Arrival', href: TRIAGE, icon: RECEIVING_NAV_ICONS.triage, tone: SCAN_STATION_TONES.triage,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view',
  },
  {
    id: 'receive', label: 'Unbox', href: UNBOX, icon: RECEIVING_NAV_ICONS.receive, tone: SCAN_STATION_TONES.receive,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view',
  },
  {
    id: 'pickup', label: 'Local Pickup', href: PICKUP, icon: RECEIVING_NAV_ICONS.pickup,
    kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view',
    railless: true,
  },
  {
    id: 'repair', label: 'Repair Service', href: REPAIR, icon: RECEIVING_NAV_ICONS.repair, tone: SCAN_STATION_TONES.repair,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'walk-in', requires: 'receiving.view',
    // Rail-less (2026-09-16):
    railless: true,
  },
  {
    id: 'testing', label: 'Quality Control', href: TECH, icon: TECH_NAV_ICONS.testing, tone: SCAN_STATION_TONES.testing,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view',
  },
  {
    id: 'ready-to-pack', label: 'Picker', href: PICK, icon: TECH_NAV_ICONS.shipping, tone: SCAN_STATION_TONES['ready-to-pack'],
    kind: 'station', stationGroup: 'floor', requires: 'picking.view',
  },
  // ── Inbound (Manage Inbound) ────────────────────────────────────────────── Single desk at `/incoming`:
  // Faced **Deliveries** (operator 2026-09-14 — never the same name as its
  {
    // `tone`: the blue its Inbound view already wears (`NAV_VIEW_ICONS['incoming.pipeline']`).
    id: 'incoming', label: 'Deliveries', href: INCOMING, icon: RECEIVING_NAV_ICONS.incoming, tone: 'text-blue-600',
    kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view',
    // Rail-less since before desk chrome existed, and now DECLARED rather than special-cased inside `isRaillessSurface` (2026-08-31).
    railless: true,
    children: [
      { id: 'pipeline', label: 'Inbound', icon: RECEIVING_NAV_ICONS.incoming, to: () => ({ pathname: INCOMING, params: { lane: null, view: null } }) },
      { id: 'docked',   label: 'Docked',  icon: Package,                      to: () => ({ pathname: INCOMING, params: { lane: 'docked', view: null, sort: null } }) },
      { id: 'unboxed',  label: 'Unboxed', icon: PackageOpen,                  to: () => ({ pathname: INCOMING, params: { lane: 'unboxed', view: null, sort: 'unboxed_newest' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      // Legacy `/dashboard?mode=inbound` resolves the PAGE to Inbound but is
      // not on either lane yet — the proxy redirects it. Lighting a tab there
      // would claim the operator is somewhere they are not.
      if (pathname !== INCOMING && !pathname.startsWith(`${INCOMING}/`)) return null;
      const lane = parseInboundLane(params.get('lane'));
      return lane === 'docked' || lane === 'unboxed' ? lane : 'pipeline';
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
    // `tone`: indigo — no colour of its own elsewhere, and not one another mode already wears.
    id: 'sourcing', label: 'Sourcing', href: SOURCING, icon: Search, tone: 'text-indigo-600', kind: 'domain', domainGroup: 'inbound', requires: 'sourcing.view',
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
  // ── FBA (Outbound lane, beside Shipping) ────────────────────────────────── The page's `FbaMode`s in lifecycle order; bare = Combine.
  {
    id: 'fba', label: 'FBA', href: OUTBOUND_MODE_PATHS.fba, icon: SHIPPING_NAV_ICONS.fba, tone: 'text-purple-600', kind: 'domain', domainGroup: 'fulfillment', requires: 'fba.view',
    railless: true,
    children: [
      { id: 'ready',   label: 'Ready',   icon: ListChecks,    to: () => ({ pathname: OUTBOUND_MODE_PATHS.fba, params: { mode: null, [FBA_MODE_PARAM]: 'ready' } }) },
      { id: 'plan',    label: 'Plan',    icon: ClipboardList, to: () => ({ pathname: OUTBOUND_MODE_PATHS.fba, params: { mode: null, [FBA_MODE_PARAM]: 'plan' } }) },
      { id: 'combine', label: 'Combine', icon: Package,       to: () => ({ pathname: OUTBOUND_MODE_PATHS.fba, params: { mode: null, [FBA_MODE_PARAM]: null } }) },
      { id: 'shipped', label: 'Shipped', icon: PackageCheck,  to: () => ({ pathname: OUTBOUND_MODE_PATHS.fba, params: { mode: null, [FBA_MODE_PARAM]: 'shipped' } }) },
      // Ex-Admin › Amazon Prep FNSKU catalog (admin dissolution).
      { id: 'catalog', label: 'Catalog', icon: Barcode,       to: () => ({ pathname: OUTBOUND_MODE_PATHS.fba, params: { mode: null, [FBA_MODE_PARAM]: 'catalog' } }) },
    ],
    resolveChild: ({ params }) => resolveFbaModeFromSearchParams(params),
  },
  // ── Labels & docs (Outbound lane, beside Shipping) ────────────────────── Label printing + document intake over the label ledger.
  // Its four views live in the contextual sidebar (owner 2026-09-28), not a tab row: Uploads (bare — one card per uploaded
  // PDF, 2026-09-28) · Labels (`?view=labels`) · Paperwork (`?view=paperwork`) · Printed (`?view=printed`) — bare keys 1 · 2 · 3 · 4.
  {
    id: 'label-intake', label: 'Labels & docs', href: SHIPPING_LABEL_INTAKE_PATH, icon: SHIPPING_NAV_ICONS.labels, tone: 'text-teal-600', kind: 'domain', domainGroup: 'fulfillment', requires: 'packing.review',
    railless: true,
    children: [
      { id: 'uploads',   label: 'Uploads',   icon: Upload,   to: () => ({ pathname: SHIPPING_LABEL_INTAKE_PATH, params: { view: null } }) },
      { id: 'labels',    label: 'Labels',    icon: Printer,  to: () => ({ pathname: SHIPPING_LABEL_INTAKE_PATH, params: { view: 'labels' } }) },
      { id: 'paperwork', label: 'Paperwork', icon: FileText, to: () => ({ pathname: SHIPPING_LABEL_INTAKE_PATH, params: { view: 'paperwork' } }) },
      { id: 'printed',   label: 'Printed',   icon: History,  to: () => ({ pathname: SHIPPING_LABEL_INTAKE_PATH, params: { view: 'printed' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      if (pathname !== SHIPPING_LABEL_INTAKE_PATH && !pathname.startsWith(`${SHIPPING_LABEL_INTAKE_PATH}/`)) return null;
      const view = params.get('view');
      return view === 'labels' || view === 'paperwork' || view === 'printed' ? view : 'uploads';
    },
  },
  // ── FBM (Fulfilled by merchant — Fulfillment lane) ────────────────────────── Exceptions · Picking · Allocate · Shipped.
  {
    id: 'outbound', label: 'FBM', href: SHIPPING_ORDERS_PATH, icon: STATION_PAGE_ICONS.outbound, tone: 'text-blue-600', kind: 'domain', domainGroup: 'fulfillment', requires: 'shipping.view',
    // Rail-less, said out loud (2026-08-31).
    railless: true,
    // Tab order (owner 2026-09-24): Exceptions · Picking · Allocate · Shipped —
    // the same order the contextual sidebar paints from `DESK_VIEWS`.
    children: [
      // Exceptions is a PEER by the same test FBA passes:
      { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle,             requires: 'orders.view',  to: () => ({ pathname: SHIPPING_EXCEPTIONS_PATH, params: {} }) },
      // "Picking", not "Pending" (operator 2026-09-26): these orders are not in
      // limbo — they are waiting to be picked (PO paired · pick list).
      { id: 'shortage', label: 'Picking',   icon: AlertCircle,                  requires: 'orders.view', to: () => ({ pathname: SHIPPING_SHORTAGE_PATH, params: {} }) },
      { id: 'orders',   label: 'Allocate',  icon: LayoutDashboard,              requires: 'orders.view', to: () => ({ pathname: SHIPPING_ORDERS_PATH, params: {} }) },
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
    id: 'scan-out', label: 'Scan out', href: OUTBOUND_MODE_PATHS['scan-out'], icon: SHIPPING_NAV_ICONS['scan-out'], tone: SCAN_STATION_TONES['scan-out'], kind: 'station', stationGroup: 'floor', requires: 'shipping.view',
    railless: true,
  },
  // ── Packing ───────────────────────────────────────────────────────────────
  // Standard-only / modeless. Legacy `?packMode=fragile|multi` deep-links may
  // still resolve in the pack surface; MasterNav no longer exposes those modes.
  {
    id: 'packer', label: 'Packing', href: PACK, icon: STATION_PAGE_ICONS.packer, tone: SCAN_STATION_TONES.packer, kind: 'station', stationGroup: 'floor', requires: 'packing.view',
  },
  // Packing Review is Operations › Packing Review (desk KPI / queue) — not a Scan Station and not a Shipping L2.
  {
    id: 'products', label: 'Products', href: PRODUCTS, icon: Tags, kind: 'domain', domainGroup: 'catalog', requires: 'sku_stock.view',
    // NOT `railless` — this desk navigates by its context rail.
    children: [
      { id: 'catalog', label: 'All products', icon: Tags, to: () => ({ pathname: PRODUCTS, params: { view: null } }) },
      { id: 'manuals', label: 'Manuals', icon: FileText, to: () => ({ pathname: PRODUCTS, params: { view: 'manuals' } }) },
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
    // `tone` (owner 2026-09-28): emerald — worn by no other mode. Label "Warehouse": the lane is Inventory (nav-name law).
    id: 'inventory', label: 'Warehouse', href: INVENTORY, icon: ShelvingUnit, tone: 'text-emerald-600', kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view',
    // `railless` (operator 2026-09-15): the left context rail is gone on every
    railless: true,
    children: [
      // `open: null` on every switch so a selection (exception/unit id) from one mode never leaks into another's right pane.
      // `@/lib/nav/parked-tabs` (operator 2026-09-15 — the tabs that do not
      // Stock and SKU Exceptions lead the band (owner 2026-09-24: "stock and
      { id: 'stock', label: 'Stock', icon: Package, to: () => ({ pathname: `${INVENTORY}/stock`, params: {} }) },
      // SKU Exceptions / Tracking Exceptions are the Exceptions hub list locked to Missing
      // pairs / Tracking (owner 2026-09-28, one list, two doors) — `/inventory/sku-exceptions`, `/inventory/triage`.
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
      if (pathname.startsWith(`${INVENTORY}/sku-exceptions`)) return 'sku-exceptions';
      if (pathname.startsWith(`${INVENTORY}/stock`)) return 'stock';
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
  // ── QC labels (Inventory lane mode) ─────────────────────────────────────────
  // One record per labelled serial unit: the QC / pre-box sticker (unit_uid +
  // serial) the picker scans, which binds that serial to the order at pick.
  {
    id: 'qc-labels', label: 'QC labels', href: QC_LABELS_PATH, icon: ScanBarcode, tone: 'text-amber-600', kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view',
    railless: true,
    children: [
      { id: 'all',   label: 'All labels', icon: ScanBarcode,  to: () => ({ pathname: QC_LABELS_PATH, params: { view: null } }) },
      { id: 'stock', label: 'In stock',   icon: Package,      to: () => ({ pathname: QC_LABELS_PATH, params: { view: 'stock' } }) },
      { id: 'order', label: 'On orders',  icon: PackageCheck, to: () => ({ pathname: QC_LABELS_PATH, params: { view: 'order' } }) },
    ],
    resolveChild: ({ params }) => {
      const view = params.get('view');
      return view === 'stock' || view === 'order' ? view : 'all';
    },
  },
  // Data Wipe (`/wipe`) is temporarily absent from master nav — revisit when the station UX is ready for general rollout.
  {
    id: 'support', label: 'Support', href: SUPPORT, icon: AlertCircle, kind: 'domain', domainGroup: 'support', requires: 'integrations.zendesk',
    // **To ship was REMOVED here (operator ruling 2026-08-31).** It was the one
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
  // ── Automations (top row under Chat, 2026-09-27) ────────────────────────── Studio is an ordinary map row (2026-08-29).
  {
    id: 'studio', label: 'Automations', href: '/studio', icon: Workflow,
    kind: 'top', requires: 'studio.view',
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

/**
 * The compact station workflow shown at the top of contextual scan-station
 * sidebars. These are parent destinations, not browse views inside one page.
 */
export const CONTEXTUAL_SCAN_STATION_PAGE_IDS = [
  'triage',
  'receive',
  'repair',
  'testing',
  'ready-to-pack',
  'packer',
  'scan-out',
] as const;

const CONTEXTUAL_SCAN_STATION_PAGE_ID_SET = new Set<string>(CONTEXTUAL_SCAN_STATION_PAGE_IDS);

export function isContextualScanStationPageId(pageId: string): boolean {
  return CONTEXTUAL_SCAN_STATION_PAGE_ID_SET.has(pageId);
}

/** Scan stations whose working rail lives inside the contextual sidebar. */
export function isContextualScanStationRoute(pathname: string | null): boolean {
  return isContextualScanStationPageId(getSidebarNavPageId(pathname));
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
      (!child.requires || (permissions?.has(child.requires) ?? false)) &&
      (!child.requiresAny || child.requiresAny.some((permission) => permissions?.has(permission) ?? false)),
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

/**
 * Read the active mode id for a page from a location. Returns `null` for
 * single-surface pages (no modes). Mirrors each panel's own derivation.
 */
export function resolveSidebarChild(pageId: string, loc: ChildLocation): string | null {
  const page = getSidebarPageNav(pageId);
  if (!page?.resolveChild) return null;
  return page.resolveChild(loc);
}
