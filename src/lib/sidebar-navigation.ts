import {
  Activity,
  AlertCircle,
  Barcode,
  BarChart3,
  ChartPie,
  Images,
  AlertTriangle,
  Check,
  Cpu,
  ClipboardList,
  Clock,
  FileText,
  History,
  Download,
  Reply,
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
  PackageX,
  Printer,
  ScanBarcode,
  Search,
  Settings,
  SalesPrice,
  SalesModeCounter,
  Radar,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Star,
  Tags,
  TicketHelp,
  User,
  Workflow,
  Zap,
  Warehouse,
  ShelvingUnit,
  Upload,
} from '@/components/Icons';
import {
  DASHBOARD_REPAIRS_MODE,
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
import { OUTBOUND_MODE_PATHS, outboundModeFromPath } from '@/lib/outbound/route-contract';
import { SHIPPING_LABEL_INTAKE_PATH, SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { FULFILLED_VIEWS, resolveFulfilledView, SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { LIVE_FEED_PATH } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSION } from '@/lib/live-feed/stages';
import { QC_LABELS_PATH } from '@/lib/labels/qc-label-views';
import { PRINT_STATION_PATH, PRINT_STATION_FNSKU_PARAM, PRINT_STATION_VIEW_PARAM } from '@/lib/print-station/fnsku';
import { PRINT_STATIONS_PATH, PRINT_STATIONS_STATION_PARAM } from '@/lib/print-station/stations';
import { DESK_LANDING_VIEW, deskViewHref } from '@/lib/outbound/desk-views';
import { FBM_DESTINATIONS, FBM_LANDING_DESTINATION, resolveFbmDestination } from '@/lib/nav/fbm-destinations';
import { CUSTOMER_PATHS, QUALITY_CONTROL_PATHS, SUPPORT_PATHS } from '@/lib/nav/route-tree';
import { SUPPORT_LIST_VIEWS, SUPPORT_LIST_VIEW_LABEL, parseSupportListView, type SupportListView } from '@/lib/support/list/support-list';
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
import {
  REPAIR_ALL_CHANNELS_LABEL,
  REPAIR_CHANNEL_LABEL,
  REPAIR_CHANNEL_PARAM,
  parseRepairChannel,
} from '@/lib/repair/repair-channel';

export type SidebarRouteKey =
  | 'stations-live'
  | 'home'
  | 'dashboard'
  | 'customers'
  | 'operations'
  | 'ops-photos'
  | 'studio'
  | 'fba'
  | 'receiving'
  | 'walk-in'
  | 'repair'
  | 'replenish'
  | 'stock'
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

/** Optional peer tags on floor benches (Arrival · Unbox / Quality Control). */
export type StationSubgroupId = 'receiving' | 'testing';

export const STATION_SUBGROUPS = [
  { id: 'receiving', label: 'Receiving', icon: STATION_PAGE_ICONS.receiving },
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

/**
 * Spine sections, in the order the Operations band paints them (operator
 * 2026-10-03: "Operations → Live feed, Scan Stations, Receiving, Fulfillment,
 * Inventory changed to Warehouse … and Products at the bottom"). The rows the
 * ruling did not name keep their prior relative order between Warehouse and
 * Products. Support sits between the Live feed and Scan Stations (owner
 * 2026-10-04). Root pages and lead / trail lanes slot in via
 * {@link SPINE_LEADING_PAGE_IDS} / {@link SPINE_LEADING_SECTION_IDS} /
 * {@link SPINE_TRAILING_SECTION_IDS}; `fixedSpineOrder` is the one composer.
 */
export const SPINE_SECTIONS = [
  // Support (owner 2026-10-04): Live feed → Support → Scan Stations.
  domainLane('support'),
  ...STATION_GROUPS, // Scan Stations
  domainLane('inbound'),
  domainLane('fulfillment'),
  domainLane('inventory'),
  domainLane('sales'),
  MAIN_GROUPS[0], // Operations (monitor)
  domainLane('catalog'),
] as const;

/** Root pages (no lane) that open the Operations band, above Scan Stations (operator 2026-10-03). */
export const SPINE_LEADING_PAGE_IDS: readonly string[] = ['live-feed'];

/** Lanes painted right after the leading root pages, above Scan Stations — Support (owner 2026-10-04). */
export const SPINE_LEADING_SECTION_IDS: readonly string[] = ['support'];

/** Lanes painted after every root page — Products closes the band (operator 2026-10-03). */
export const SPINE_TRAILING_SECTION_IDS: readonly string[] = ['catalog'];

export type SpineSectionId = (typeof SPINE_SECTIONS)[number]['id'];

/** Distinct station ink shared by the parent switcher and its `G` key hint. */
export const SCAN_STATION_TONES = {
  'stations-live': 'text-sky-600',
  triage: 'text-cyan-600',
  receive: 'text-blue-600',
  repair: 'text-amber-600',
  testing: 'text-orange-600',
  'ready-to-pack': 'text-emerald-600',
  packer: 'text-purple-600',
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
   * Keep this parent row in the fixed utility band at the absolute bottom of
   * the sidebar, below the main navigation sequence.
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
  // Top map rows — Chat → Tasks → Automations → Exceptions → Media Library. Chat leads the
  // page map and the ⌘K pin (operator 2026-09-27); `/ai-chat` → SessionSurface,
  // the ONE assistant door. Automations sits right under Chat, a top row rather
  // than the last lane (operator 2026-09-27: a more prominent action; href
  // stays /studio).
  { id: 'ai-chat',           label: 'Chat',           href: '/ai-chat',            icon: MessageSquare,   kind: 'top', requires: 'assistant.chat' },
  { id: 'home',              label: 'Tasks',           href: '/',                   icon: ListChecks,      kind: 'top' },
  { id: 'studio',            label: 'Automations',    href: '/studio',             icon: Workflow,        kind: 'top', requires: 'studio.view' },
  // Exceptions (owner 2026-09-28): every category's blockers in one hub. No
  // single `requires` — the row shows while ANY kind child survives the child
  // funnel (`getSidebarNavItems` → `hasChildDoor`), i.e. the caller can see
  // any exception source.
  { id: 'exceptions',        label: 'Exceptions',     href: EXCEPTIONS_PATH,       icon: AlertTriangle,   kind: 'top', keywords: ['exceptions', 'blockers', 'held orders', 'missing pairs', 'bin errors', 'tracking exceptions', 'claim', 'short', 'unfound'] },
  // Print station (owner 2026-09-29): a parent-level page for printing to ANY computer in the org — first FNSKU labels,
  // found from the contextual sidebar's Find and sent silently to the print station at a packer's table.
  { id: 'print-station',     label: 'Print station',  href: PRINT_STATION_PATH,    icon: Printer,         kind: 'top', spineBottom: true, requires: 'print.label', keywords: ['print', 'printer', 'reprint', 'fnsku', 'fba label', 'amazon label', 'unit label', 'print station', 'send to station'] },
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
  // Live feed (operator 2026-10-03): ONE root row under the "Operations" band subtitle — no lane, no lane door
  // (`spineNavigationBand`). The outbound package board by stage (To pick → Picked → Packed → Scanned out).
  { id: 'live-feed',         label: 'Live feed',   href: LIVE_FEED_PATH,        icon: Radar,           requires: LIVE_FEED_PERMISSION, keywords: ['live', 'board', 'packages', 'where is this package', 'outbound', 'to pick', 'picked', 'packed', 'scanned out', 'kanban'] },
  // Reports — retained Packer day and task-time views.
  // **A PARENT-LEVEL row, not a Monitor member** (operator 2026-09-15:
  { id: 'reports',            label: 'Reports',     href: '/reports?tab=packer', icon: BarChart3,       kind: 'top', spineFlat: true, spineBottom: true, requires: 'operations.view' },
  // Scan Stations — scan-first benches (Arrival / Unbox / Quality Control /
  // Picker / Packing / Scan out).
  { id: 'stations-live',      label: 'Live feed V2', href: '/stations/live',       icon: Activity, tone: SCAN_STATION_TONES['stations-live'], kind: 'station', stationGroup: 'floor', requires: 'operations.view' },
  { id: 'triage',            label: 'Arrival',     href: '/triage',             icon: RECEIVING_NAV_ICONS.triage,  tone: SCAN_STATION_TONES.triage, kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view' },
  { id: 'receive',           label: 'Unbox',       href: '/unbox',              icon: RECEIVING_NAV_ICONS.receive, tone: SCAN_STATION_TONES.receive, kind: 'station', stationGroup: 'floor', stationSubgroup: 'receiving', requires: 'receiving.view' },
  { id: 'pickup',            label: 'Local Pickup', href: '/pickup',            icon: RECEIVING_NAV_ICONS.pickup,  kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view' },
  // Repair service is a Receiving MODE (owner 2026-09-29) — the repair tickets,
  // split into Shipped in · Dropped off by `repair_service.intake_channel`.
  { id: 'repair',            label: 'Repair service', href: '/repair',          icon: RECEIVING_NAV_ICONS.repair,  tone: SCAN_STATION_TONES.repair, kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view' },
  // Quality Control (`/test`) and the Picker desk (`/pick`) are separate
  // first-class Scan Stations (owner 2026-09-27). Picking is not a testing bench,
  // so the Picker row carries no `testing` subgroup.
  { id: 'testing',           label: 'Quality control', href: QUALITY_CONTROL_PATHS.desktop, icon: TECH_NAV_ICONS.testing, tone: SCAN_STATION_TONES.testing, kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view' },
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
  // ── Warehouse (lane `inventory`) ──────────────────────────────────────────
  // Lane is Warehouse (operator 2026-10-03). This row is Locations so it does not
  // share the lane name (nav-name law). The default locations view is "All".
  { id: 'stock',             label: 'Stock',       href: '/inventory/stock',     icon: Package,        kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view', keywords: ['inventory', 'stock', 'replenish', 'move stock', 'warehouse'] },
  { id: 'inventory',         label: 'Locations',   href: '/inventory/locations', icon: ShelvingUnit,   kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view', keywords: ['locations', 'rooms', 'racks', 'aisles', 'bays', 'warehouse'] },
  // QC labels rides the Warehouse lane beside Locations (owner 2026-09-28): the per-unit QC / pre-box label the picker scans.
  { id: 'qc-labels',         label: 'QC labels',   href: QC_LABELS_PATH,        icon: ScanBarcode,     kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view', keywords: ['qc label', 'prebox label', 'pre-box', 'unit label', 'reprint', 'serial label'] },
  // Sourcing rides the INBOUND lane (N4, operator 2026-09-14): demand → PO →
  // on the way → received is one direction. The 2026-08-03 ruling only kept it
  // out of *Warehouse*; the row itself is unchanged.
  { id: 'sourcing',          label: 'Sourcing',    href: '/sourcing',           icon: ShoppingCart,    kind: 'domain', domainGroup: 'inbound', requires: 'sourcing.view' },
  // Locations folded under the Locations row (`/inventory/locations`) — P4 condensation.
  // FBM (owner 2026-09-28): every order WE store, pack and ship, on any channel —
  // the clean split from FBA, where Amazon ships. Same page id / routes as the
  // old "Shipping" desk; the old name still finds it in ⌘K.
  { id: 'outbound',          label: 'FBM',         href: deskViewHref(DESK_LANDING_VIEW.id), icon: STATION_PAGE_ICONS.outbound,  kind: 'domain', domainGroup: 'fulfillment', requires: 'shipping.view', description: 'Fulfilled by merchant · all channels', keywords: ['shipping', 'ship', 'fulfilled by merchant', 'merchant fulfilled', 'mfn', 'to ship', 'allocate'] },
  // Fulfilled is the archive of every package that left — peer of FBM, not its child.
  { id: 'fulfilled',         label: 'Fulfilled',   href: SHIPPING_SHIPPED_PATH, icon: PackageCheck, kind: 'domain', domainGroup: 'fulfillment', requires: 'packing.view', description: 'Every package that left the building', keywords: ['fulfilled', 'shipped', 'scan out', 'delivered', 'tracking'] },
  // FBA rides the Fulfillment lane beside FBM (operator 2026-09-14).
  { id: 'fba',               label: 'FBA',         href: OUTBOUND_MODE_PATHS.fba, icon: SHIPPING_NAV_ICONS.fba, kind: 'domain', domainGroup: 'fulfillment', requires: 'fba.view', description: 'Fulfilled by Amazon' },
  // ── Sales ───────────────────────────────────────────────────────────────── Own root (D4) — front-desk history, not a fulfillment lane.
  { id: 'sales',             label: 'Front desk',  href: '/counter',             icon: SalesPrice, kind: 'domain', domainGroup: 'sales', requires: 'dashboard.view' },
  { id: 'customers',         label: 'Customers',   href: CUSTOMER_PATHS.desktop, icon: User, kind: 'domain', domainGroup: 'sales', requires: 'orders.view', description: 'Buyer identity, order history and channel throughput' },
  // ── Support (owner 2026-10-04) ─────────────────────────────────────────── Its own lane; the row is the
  // collection ("Support items", route tree) so it never wears the lane's name. The lane door opens it.
  { id: 'support',           label: 'Support items', href: SUPPORT_PATHS.desktop, icon: TicketHelp, tone: 'text-orange-600', kind: 'domain', domainGroup: 'support', requires: 'support.thread.view', keywords: ['support', 'customer messages', 'conversations', 'inquiries', 'zendesk', 'ebay messages', 'check-ins', 'internal records'] },
  // Counter remains a Sales child (`SIDEBAR_PAGE_NAV`); Customers is its own L1 destination.
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
  // `studio` DROPPED 2026-09-29 — lens · zoom live in the contextual sidebar;
  // the library moved into the stage beside the canvas.
  // `settings` DROPPED 2026-09-10 — Pattern E card landing + /settings/me.
  // Roles/Access still need their picker rails; those paths are special-cased
  // in hasSidebarContextPanel below (the route key stays `settings`).
  // Audit and FBA records render in their central workspaces. FBA scan intake
  // is declared through NAV_PAGE_DECLS and painted by ContextualSidebar.
  // `inventory` DROPPED 2026-09-15 — Warehouse navigation drills inside the
  // existing spine, like Fulfillment. It must not mount a second route rail.
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
  if (pathname === '/stations/live' || pathname.startsWith('/stations/live/')) return 'stations-live';
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
  if (pathname === CUSTOMER_PATHS.desktop || pathname.startsWith(`${CUSTOMER_PATHS.desktop}/`)) return 'customers';
  if (pathname === SUPPORT_PATHS.desktop || pathname.startsWith(`${SUPPORT_PATHS.desktop}/`)) return 'support';
  // Repair is a Receiving mode with its own route — it mounts the receiving
  // sidebar + rail, not the Sales page's.
  if (pathname === '/repair' || pathname.startsWith('/repair/')) return 'receiving';
  if (pathname === '/replenish' || pathname.startsWith('/replenish/')) return 'replenish';
  if (pathname === '/products' || pathname.startsWith('/products/')) return 'products';
  if (pathname === '/warehouse' || pathname.startsWith('/warehouse/')) return 'inventory';
  if (pathname === '/sourcing' || pathname.startsWith('/sourcing/')) return 'sourcing';
  if (
    pathname === '/inventory/stock' || pathname.startsWith('/inventory/stock/') ||
    pathname === '/inventory/graph' || pathname.startsWith('/inventory/graph/') ||
    pathname === '/inventory/reason-codes' || pathname.startsWith('/inventory/reason-codes/') ||
    pathname === '/inventory/favorites' || pathname.startsWith('/inventory/favorites/')
  ) return 'stock';
  if (pathname === '/inventory' || pathname.startsWith('/inventory/')) return 'inventory';
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
  // `/fulfilled` is the package archive (legacy `/shipping/shipped` redirects here).
  if (pathname === '/fulfilled' || pathname.startsWith('/fulfilled/')) return 'outbound';
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
  if (pathname === '/inventory' && searchParams?.get('section') === 'replenish') return 'stock';
  if (pathname === '/stations/live' || pathname.startsWith('/stations/live/')) return 'stations-live';
  if (pathname === '/unbox' || pathname.startsWith('/unbox/')) return 'receive';
  if (pathname === '/triage' || pathname.startsWith('/triage/')) return 'triage';
  if (pathname === '/incoming' || pathname.startsWith('/incoming/')) return 'incoming';
  if (pathname === '/pickup' || pathname.startsWith('/pickup/')) return 'pickup';
  if (pathname === '/repair' || pathname.startsWith('/repair/')) return 'repair';
  // Legacy `/receiving` (+ history) lands on Unbox — same default as before.
  if (pathname === '/receiving' || pathname.startsWith('/receiving/')) return 'receive';
  // Dashboard boards dissolved into their domain homes (D5):
  if (pathname === '/counter' || pathname.startsWith('/counter/')) return 'sales';
  if (pathname === CUSTOMER_PATHS.desktop || pathname.startsWith(`${CUSTOMER_PATHS.desktop}/`)) return 'customers';
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
  if (pathname === '/fulfilled' || pathname.startsWith('/fulfilled/')) return 'fulfilled';
  if (outboundMode) return 'outbound';
  if (pathname === '/shipping/orders' || pathname.startsWith('/shipping/orders/')) return 'outbound';
  if (pathname === '/reports' || pathname.startsWith('/reports/')) return 'reports';
  if (pathname === EXCEPTIONS_PATH || pathname.startsWith(`${EXCEPTIONS_PATH}/`)) return 'exceptions';
  if (pathname === LIVE_FEED_PATH || pathname.startsWith(`${LIVE_FEED_PATH}/`)) return 'live-feed';
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
  return masterNavItemForPath(pathname, searchParams)?.label ?? 'Tasks';
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
  return item.kind === 'top' && item.spineBand !== false && item.spineBottom !== true;
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

/** The Workspaces lanes, in {@link SPINE_SECTIONS} order — Support → Receiving → Fulfillment → Warehouse → Sales → Operations → Products. */
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
  // The Support workspace — the list endpoint's gate (`GET /api/support/list`).
  { prefix: '/support',            permission: 'support.thread.view' },
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
  { prefix: '/fulfilled', permission: 'packing.view' },
  { prefix: '/shipping/orders',    permission: 'orders.view' },
  { prefix: '/shipping',           permission: 'shipping.view' },
  { prefix: '/outbound',           permission: 'shipping.view' },
  { prefix: '/products',           permission: 'sku_stock.view' },
  { prefix: '/warehouse',          permission: 'sku_stock.view' },
  { prefix: '/sourcing',           permission: 'sourcing.view' },
  { prefix: '/inventory',          permission: 'sku_stock.view' },
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
const TECH = QUALITY_CONTROL_PATHS.desktop;
// The Picker desk — split from `/test` when Picking and QC became separate stations (owner 2026-09-27).
const PICK = '/pick';
// Packing graduated to its own first-class surface route (`/pack`,
// operator-surfaces refactor Phase 7); its modes navigate there. Legacy
// `/packer` still resolves (proxy redirect + shared page).
const PACK = '/pack';
// The import record (`src/lib/imports/params.ts` IMPORTS_PATH).
const IMPORTS = '/operations/imports';

/** Each exception kind's nav glyph — the icon of the surface its source lives on. */
const EXCEPTION_KIND_ICONS: Readonly<Record<ExceptionKind, SidebarIconComponent>> = {
  fbm: STATION_PAGE_ICONS.outbound,
  labels: SHIPPING_NAV_ICONS.labels,
  paperwork: FileText,
  unmatched: ScanBarcode,
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

/** A Tasks saved view: `?tab=` × `?filter=`, project and open record cleared. */
function homeView(tab: string | null, filter: 'done' | 'waiting' | null): ChildNavTarget {
  return { pathname: '/', params: { tab, filter, project: null, task: null, check: null } };
}

/** The no-view Support child: every Support item (`/support`, no `?view=`). */
export const SUPPORT_QUEUE_VIEW_ID = 'queue';

/** Each Support view's glyph — its job, read before its word (`NAV_VIEW_ICONS['support.<view>']` adds the ink). */
export const SUPPORT_VIEW_ICONS: Readonly<Record<SupportListView | typeof SUPPORT_QUEUE_VIEW_ID, SidebarIconComponent>> = {
  queue: Inbox,
  'needs-reply': Reply,
  'followed-up': MessageSquare,
  'draft-ready': FileText,
  'follow-up-due': Clock,
  unclassified: AlertCircle,
  internal: ClipboardList,
  unassigned: User,
  'sync-failed': AlertTriangle,
  'check-ins': PackageCheck,
};

/** A Support view: `?view=` (null = Queue); the open record is dropped. */
function supportView(view: SupportListView | null): ChildNavTarget {
  return { pathname: SUPPORT_PATHS.desktop, params: { view, item: null } };
}

export const SIDEBAR_PAGE_NAV: SidebarPageNav[] = [
  // ── Tasks (was Daily, was Home) ───────────────────────────────────────────
  // Owner 2026-09-29: task-first follow-up desk on the house two-tier sidebar
  // (`NAV_PAGE_DECLS.home.modes`, the Exceptions shape): three PARENTS — the
  // mode card, `G` + letter (`NAV_PAGE_GO_KEYS.home`) — and under the current
  // parent its saved views on bare `1`–`3`. Ungrouped child = parent; a
  // child's `group` names its parent. A view is `?tab=` × `?filter=`.
  {
    id: 'home', label: 'Tasks', href: '/', icon: ListChecks, kind: 'top',
    children: [
      { id: 'tasks', label: 'All tasks', icon: Inbox, to: () => homeView(null, null) },
      { id: 'daily', label: 'Daily checklist', icon: ListChecks, to: () => homeView('checklist', null) },
      { id: 'projects', label: 'Long-term projects', icon: Layers, to: () => homeView('project', null) },
      { id: 'all', label: 'Everything', icon: Inbox, group: 'tasks', to: () => homeView(null, null) },
      { id: 'task', label: 'Standalone', icon: ClipboardList, group: 'tasks', to: () => homeView('task', null) },
      { id: 'all-done', label: 'Finished', icon: History, group: 'tasks', to: () => homeView(null, 'done') },
      // Open work on a hold — Pending · Follow-up · Blocked (`TASK_HOLDS`, owner 2026-09-30).
      { id: 'all-waiting', label: 'Waiting', icon: Clock, group: 'tasks', to: () => homeView(null, 'waiting') },
      { id: 'checklist', label: 'Today', icon: Check, group: 'daily', to: () => homeView('checklist', null) },
      { id: 'checklist-done', label: 'Ticked off', icon: History, group: 'daily', to: () => homeView('checklist', 'done') },
      { id: 'project', label: 'Active', icon: Layers, group: 'projects', to: () => homeView('project', null) },
      { id: 'project-done', label: 'Wrapped up', icon: History, group: 'projects', to: () => homeView('project', 'done') },
    ],
    resolveChild: ({ params }) => {
      const raw = params.get('tab');
      const tab = raw === 'task' || raw === 'checklist' || raw === 'project' ? raw : 'all';
      // `task` has no finished view of its own: its done list is the parent's.
      if (params.get('filter') === 'done') return tab === 'all' || tab === 'task' ? 'all-done' : `${tab}-done`;
      if (params.get('filter') === 'waiting' && (tab === 'all' || tab === 'task')) return 'all-waiting';
      return tab;
    },
  },
  // ── Chat ─────────────────────────────────────────────────────────────────── No views: its panel is the staffer's
  // threads (`NAV_PAGE_DECLS['ai-chat'].recentsPanel`), led by New chat.
  {
    id: 'ai-chat', label: 'Chat', href: '/ai-chat', icon: MessageSquare, kind: 'top', requires: 'assistant.chat',
  },
  // ── Sales (front-desk history) ──────────────────────────────────────────── The `/dashboard` sales domain, promoted to its own root…
  {
    id: 'sales', label: 'Front desk', href: '/counter', icon: SalesPrice,
    kind: 'domain', domainGroup: 'sales', requires: 'dashboard.view',
    children: [
      { id: 'counter', label: 'Counter', icon: SalesModeCounter, requires: 'walk_in.view', to: () => ({ pathname: '/counter', params: {} }) },
      { id: 'pickup', label: 'Local Pickup', icon: ShoppingCart, requires: DASHBOARD_SALES_PERMISSION, to: () => ({ pathname: DASHBOARD, params: { mode: 'pickup' } }) },
      // Repairs, by how the device arrived (owner 2026-09-29/30) — the same three
      // views `/repair` carries, under a heading (never a row) of their own.
      { id: 'repairs-all', label: REPAIR_ALL_CHANNELS_LABEL, icon: Layers, group: 'Repair service', requires: 'repair.view', to: () => ({ pathname: DASHBOARD, params: { mode: DASHBOARD_REPAIRS_MODE, [REPAIR_CHANNEL_PARAM]: null } }) },
      { id: 'repairs-shipped-in', label: REPAIR_CHANNEL_LABEL.shipment, icon: Truck, group: 'Repair service', requires: 'repair.view', to: () => ({ pathname: DASHBOARD, params: { mode: DASHBOARD_REPAIRS_MODE, [REPAIR_CHANNEL_PARAM]: 'shipment' } }) },
      { id: 'repairs-dropped-off', label: REPAIR_CHANNEL_LABEL.pickup, icon: SalesModeCounter, group: 'Repair service', requires: 'repair.view', to: () => ({ pathname: DASHBOARD, params: { mode: DASHBOARD_REPAIRS_MODE, [REPAIR_CHANNEL_PARAM]: 'pickup' } }) },
    ],
    resolveChild: ({ params, pathname }) => {
      if (pathname.startsWith('/counter')) return 'counter';
      const mode = params.get('mode');
      if (mode === 'pickup') return 'pickup';
      if (mode === 'repairs') {
        const channel = parseRepairChannel(params.get(REPAIR_CHANNEL_PARAM));
        return channel === 'pickup' ? 'repairs-dropped-off' : channel === 'shipment' ? 'repairs-shipped-in' : 'repairs-all';
      }
      return 'counter';
    },
  },
  // ── Customers (Sales lane) ─────────────────────────────────────────────── A first-class
  // destination on both desktop and mobile, with Find owned by this page.
  {
    id: 'customers', label: 'Customers', href: CUSTOMER_PATHS.desktop, icon: User,
    kind: 'domain', domainGroup: 'sales', requires: 'orders.view',
  },
  // ── Support (owner 2026-10-04) ─────────────────────────────────────────── The `/support` workspace on the
  // local model. Its views are SUPPORT_LIST_VIEWS (`?view=`, the list's own predicate) under the no-view
  // default, Queue (every Support item). The local status row (New … Closed) is the page's chip cut
  // (`?status=`), never a view; sort, group-by and Platform · Account · Assignee are sidebar controls /
  // facets (`NAV_PAGE_DECLS.support`). A view switch drops the open record.
  {
    // `tone`: orange (owner 2026-10-04) — the lane's ink (`spineParentTone('support')`).
    id: 'support', label: 'Support items', href: SUPPORT_PATHS.desktop, icon: TicketHelp, tone: 'text-orange-600',
    kind: 'domain', domainGroup: 'support', requires: 'support.thread.view',
    railless: true,
    children: [
      { id: SUPPORT_QUEUE_VIEW_ID, label: 'Queue', icon: SUPPORT_VIEW_ICONS.queue, to: () => supportView(null) },
      ...SUPPORT_LIST_VIEWS.map((view) => ({
        id: view,
        label: SUPPORT_LIST_VIEW_LABEL[view],
        icon: SUPPORT_VIEW_ICONS[view],
        to: () => supportView(view),
      })),
    ],
    resolveChild: ({ params }) => parseSupportListView(params.get('view')) ?? SUPPORT_QUEUE_VIEW_ID,
  },
  // ── Operations ──────────────────────────────────────────────────────────── `?mode=history|signals`; bare /operations = the Live…
  {
    id: 'operations', label: 'Operations', href: OPERATIONS, icon: Monitor, kind: 'main', mainGroup: 'monitor', requires: 'operations.view',
    // NOT `railless` — this desk navigates by its context rail.
    children: [
      // Each target used to null twelve sibling keys by hand — the largest of the nine deleted denylists, re-stated once per mode.
      { id: 'live',      label: 'Overview',  icon: Activity,  to: () => ({ pathname: OPERATIONS, params: { mode: null } }) },
      // The feed is its own page; this row is how the Operations panel offers it (operator 2026-10-03).
      { id: 'live-feed', label: 'Live feed', icon: Radar,     to: () => ({ pathname: LIVE_FEED_PATH, params: {} }) },
      { id: 'checks',    label: 'Checks',    icon: ClipboardList, to: () => ({ pathname: OPERATIONS, params: { mode: 'checks' } }) },
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
    resolveChild: ({ params }) => {
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
    id: 'reports', label: 'Reports', href: '/reports?tab=packer', icon: BarChart3, kind: 'top', spineBottom: true, requires: 'operations.view',
    children: [
      { id: 'packer-day', label: 'Packer day', icon: Package, to: () => ({ pathname: '/reports', params: { tab: 'packer' } }) },
      { id: 'activity',   label: 'Task time',  icon: Clock,   to: () => ({ pathname: '/reports', params: { tab: 'activity' } }) },
    ],
    resolveChild: ({ params }) => (params.get('tab') === 'activity' ? 'activity' : 'packer-day'),
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
  // ── Live feed ─────────────────────────────────────────────────────────── One root row under the "Operations" band
  // subtitle (operator 2026-10-03) — no lane, its own page. The outbound package board: To pick → Picked → Packed →
  // Scanned out, its Day | Week window page chrome. No views, no controls.
  {
    id: 'live-feed', label: 'Live feed', href: LIVE_FEED_PATH, icon: Radar, tone: 'text-orange-600',
    requires: LIVE_FEED_PERMISSION,
    railless: true,
    description: 'Every outbound package by stage — to pick, picked, packed, scanned out',
  },
  // ── Print station ─────────────────────────────────────────────────────────── Its own MODES (owner 2026-10-04,
  // `NAV_PAGE_DECLS['print-station'].modes`, `G` then a letter): FNSKU labels — printing: All (bare URL) · Reprinted, Find
  // (`?q=`) narrows the FBA catalog, `?fnsku=` is the open label — and Stations — managing the org's print stations
  // (`/print-station/stations`, `?station=` the open one). Modes are the ungrouped children; a view's `group` is its mode.
  {
    id: 'print-station', label: 'Print station', href: PRINT_STATION_PATH, icon: Printer, tone: 'text-sky-600', kind: 'top', spineBottom: true, requires: 'print.label',
    railless: true,
    children: [
      { id: 'fnsku-labels', label: 'FNSKU labels', icon: ScanBarcode, to: () => ({ pathname: PRINT_STATION_PATH, params: { [PRINT_STATION_VIEW_PARAM]: null, [PRINT_STATION_FNSKU_PARAM]: null } }) },
      { id: 'fnsku', label: 'All FNSKUs', icon: ScanBarcode, group: 'fnsku-labels', to: () => ({ pathname: PRINT_STATION_PATH, params: { [PRINT_STATION_VIEW_PARAM]: null, [PRINT_STATION_FNSKU_PARAM]: null } }) },
      { id: 'fnsku-reprinted', label: 'Reprinted', icon: History, group: 'fnsku-labels', to: () => ({ pathname: PRINT_STATION_PATH, params: { [PRINT_STATION_VIEW_PARAM]: 'reprinted', [PRINT_STATION_FNSKU_PARAM]: null } }) },
      { id: 'stations', label: 'Stations', icon: Printer, to: () => ({ pathname: PRINT_STATIONS_PATH, params: { [PRINT_STATIONS_STATION_PARAM]: null } }) },
      { id: 'stations-all', label: 'All stations', icon: Printer, group: 'stations', to: () => ({ pathname: PRINT_STATIONS_PATH, params: { [PRINT_STATIONS_STATION_PARAM]: null } }) },
    ],
    resolveChild: ({ pathname, params }) =>
      pathname === PRINT_STATIONS_PATH || pathname.startsWith(`${PRINT_STATIONS_PATH}/`)
        ? 'stations-all'
        : params.get(PRINT_STATION_VIEW_PARAM) === 'reprinted'
          ? 'fnsku-reprinted'
          : 'fnsku',
  },
  // ── Pasted list (`/search/list`, route-tree `pasted-list`) ────────────────
  // Off the spine (not in APP_SIDEBAR_NAV — reached from the search bar's
  // full-screen button). Registered so the resolver opens its own panel:
  // the bucket facet + Sort that left the page body (ruling A1/A4).
  { id: 'search', label: 'Pasted list', href: '/search/list', icon: Search, kind: 'top' },
  // ── Receiving family ─────── Arrival / Unbox are physical stations; Local
  // Pickup and Repair service are modes of the Receiving desk lane.
  {
    id: 'stations-live', label: 'Live feed V2', href: '/stations/live', icon: Activity, tone: SCAN_STATION_TONES['stations-live'],
    kind: 'station', stationGroup: 'floor', requires: 'operations.view', railless: true,
  },
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
  // Repair service (Receiving mode, owner 2026-09-29/30): its views split the
  // tickets by `repair_service.intake_channel` — All (bare, every channel) ·
  // Shipped in (`?channel=shipment`) · Dropped off (`?channel=pickup`), bare
  // keys 1 · 2 · 3. The status `?tab=` rides beside.
  {
    id: 'repair', label: 'Repair service', href: REPAIR, icon: RECEIVING_NAV_ICONS.repair, tone: SCAN_STATION_TONES.repair,
    kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view',
    // Rail-less (2026-09-16):
    railless: true,
    children: [
      { id: 'all',         label: REPAIR_ALL_CHANNELS_LABEL,     icon: Layers,           to: () => ({ pathname: REPAIR, params: { [REPAIR_CHANNEL_PARAM]: null } }) },
      { id: 'shipped-in',  label: REPAIR_CHANNEL_LABEL.shipment, icon: Truck,            to: () => ({ pathname: REPAIR, params: { [REPAIR_CHANNEL_PARAM]: 'shipment' } }) },
      { id: 'dropped-off', label: REPAIR_CHANNEL_LABEL.pickup,   icon: SalesModeCounter, to: () => ({ pathname: REPAIR, params: { [REPAIR_CHANNEL_PARAM]: 'pickup' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      if (pathname !== REPAIR && !pathname.startsWith(`${REPAIR}/`)) return null;
      const channel = parseRepairChannel(params.get(REPAIR_CHANNEL_PARAM));
      return channel === 'pickup' ? 'dropped-off' : channel === 'shipment' ? 'shipped-in' : 'all';
    },
  },
  {
    id: 'testing', label: 'Quality control', href: TECH, icon: TECH_NAV_ICONS.testing, tone: SCAN_STATION_TONES.testing,
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
      { id: 'repair',   label: 'Repair service', icon: RECEIVING_NAV_ICONS.repair, to: () => ({ pathname: REPAIR, params: {} }) },
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
    ],
    resolveChild: ({ params }) => {
      const m = params.get('mode');
      if (m === 'scout' || m === 'lookup') return 'scout';
      if (m === 'watchlist') return 'watchlist';
      if (m === 'searches') return 'searches';
      if (m === 'suppliers') return 'suppliers';
      if (m === 'models') return 'models';
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
  // Its three saved views live in the contextual sidebar, not a tab row. Allocate stays first while inside
  // Labels & docs, then Bulk (bare) · Shipping labels · Packing slips are terminal numeric choices.
  {
    id: 'label-intake', label: 'Labels & docs', href: SHIPPING_LABEL_INTAKE_PATH, icon: SHIPPING_NAV_ICONS.labels, tone: 'text-teal-600', kind: 'domain', domainGroup: 'fulfillment', requires: 'packing.review',
    railless: true,
    children: [
      {
        id: FBM_LANDING_DESTINATION.id,
        label: FBM_LANDING_DESTINATION.label,
        icon: FBM_LANDING_DESTINATION.icon,
        requires: FBM_LANDING_DESTINATION.requires,
        to: () => ({ pathname: FBM_LANDING_DESTINATION.pathname, params: {} }),
      },
      { id: 'uploads',   label: 'Bulk',            icon: Upload,   to: () => ({ pathname: SHIPPING_LABEL_INTAKE_PATH, params: { view: null } }) },
      { id: 'labels',    label: 'Shipping labels', icon: Printer,  to: () => ({ pathname: SHIPPING_LABEL_INTAKE_PATH, params: { view: 'labels' } }) },
      { id: 'paperwork', label: 'Packing slips',   icon: FileText, to: () => ({ pathname: SHIPPING_LABEL_INTAKE_PATH, params: { view: 'paperwork' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      if (pathname !== SHIPPING_LABEL_INTAKE_PATH && !pathname.startsWith(`${SHIPPING_LABEL_INTAKE_PATH}/`)) return null;
      const view = params.get('view');
      return view === 'labels' || view === 'paperwork' ? view : 'uploads';
    },
  },
  // ── Fulfilled (Fulfillment lane) ────────────────────────────────────────── Every package that left. Saved views are presets, never a child named Fulfilled.
  {
    id: 'fulfilled', label: 'Fulfilled', href: SHIPPING_SHIPPED_PATH, icon: PackageCheck, tone: 'text-emerald-600', kind: 'domain', domainGroup: 'fulfillment', requires: 'packing.view',
    railless: true,
    description: 'Every package that left the building',
    children: FULFILLED_VIEWS.map((view) => ({
      id: view.id,
      label: view.label,
      icon: view.id === 'online' ? ShoppingCart
        : view.id === 'fba' ? SHIPPING_NAV_ICONS.fba
        : view.id === 'sku' ? Tags
        : view.id === 'delivered' ? Check
        : List,
      to: () => ({ pathname: SHIPPING_SHIPPED_PATH, params: { ...view.params } }),
    })),
    resolveChild: ({ pathname, params }) => {
      if (pathname !== SHIPPING_SHIPPED_PATH && !pathname.startsWith(`${SHIPPING_SHIPPED_PATH}/`)) return null;
      return resolveFulfilledView(params);
    },
  },
  // ── FBM (Fulfilled by merchant — Fulfillment lane) ──────────────────────────
  // Visible workspaces only. Internal desk routes (notably the legacy
  // /shipping/exceptions redirect and Fulfilled recognition) never paint here.
  {
    id: 'outbound', label: 'FBM', href: deskViewHref(DESK_LANDING_VIEW.id), icon: STATION_PAGE_ICONS.outbound, tone: 'text-blue-600', kind: 'domain', domainGroup: 'fulfillment', requires: 'shipping.view',
    // Rail-less, said out loud (2026-08-31).
    railless: true,
    children: FBM_DESTINATIONS.map((destination) => ({
      id: destination.id,
      label: destination.label,
      icon: destination.icon,
      requires: destination.requires,
      to: () => ({ pathname: destination.pathname, params: {} }),
    })),
    resolveChild: ({ pathname, params }) => {
      // Support › Inquiries alias — Support's resolveChild owns the pin.
      if (params.get('context') === 'support') return null;
      const destination = resolveFbmDestination(pathname);
      if (destination) return destination;
      // FBM's aliases — bare `/shipping`, legacy `/outbound` and the old
      // `/dashboard` queue — redirect to the landing view, so they light it;
      // their `?mode=fba|ready` belongs to the FBA desk. Every other path (FBA,
      // Labels & docs, the archive, the parked Shortage desk) is on no FBM view.
      const alias = pathname === '/shipping' || pathname === '/outbound' || pathname === DASHBOARD || pathname.startsWith(`${DASHBOARD}/`);
      const mode = params.get('mode');
      return alias && mode !== 'fba' && mode !== 'ready' ? 'orders' : null;
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
    resolveChild: ({ params }) => parseProductsView(params.get('view')),
  },
  // ── Stock ─────────────────────────────────────────────────────────────────
  // Stock is a first-class warehouse page. Replenishment is one named stock
  // view, not a sibling application.
  {
    id: 'stock', label: 'Stock', href: `${INVENTORY}/stock`, icon: Package, tone: 'text-blue-600', kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view',
    children: [
      { id: 'all', label: 'All stock', icon: Package, to: () => ({ pathname: `${INVENTORY}/stock`, params: { view: null, status: null, rtab: null, rsku: null, rstatus: null } }) },
      { id: 'replenish', label: 'Needs replenishment', icon: History, to: () => ({ pathname: `${INVENTORY}/stock`, params: { view: 'replenish', rtab: null, status: null } }) },
      { id: 'fifo', label: 'Shipped FIFO', icon: Truck, to: () => ({ pathname: `${INVENTORY}/stock`, params: { view: 'replenish', rtab: 'fifo', status: null } }) },
      { id: 'low-stock', label: 'Low stock', icon: AlertTriangle, to: () => ({ pathname: `${INVENTORY}/stock`, params: { view: null, status: 'low-stock', rtab: null, rsku: null, rstatus: null } }) },
      { id: 'out-of-stock', label: 'Out of stock', icon: PackageX, to: () => ({ pathname: `${INVENTORY}/stock`, params: { view: null, status: 'out-of-stock', rtab: null, rsku: null, rstatus: null } }) },
    ],
    resolveChild: ({ params }) => {
      if (params.get('view') === 'replenish') return params.get('rtab') === 'fifo' ? 'fifo' : 'replenish';
      if (params.get('status') === 'low-stock') return 'low-stock';
      if (params.get('status') === 'out-of-stock') return 'out-of-stock';
      return 'all';
    },
  },
  // ── Locations ─────────────────────────────────────────────────────────────
  {
    // `tone` (owner 2026-09-28): emerald — worn by no other mode. Label "Locations":
    // the lane is Warehouse (operator 2026-10-03); the row must not share that name.
    id: 'inventory', label: 'Locations', href: `${INVENTORY}/locations`, icon: ShelvingUnit, tone: 'text-emerald-600', kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view',
    children: [
      { id: 'locations', label: 'All', icon: List, to: () => ({ pathname: `${INVENTORY}/locations`, params: { tab: null, code: null, room: null, new: null } }) },
      { id: 'rooms', label: 'Rooms', icon: Warehouse, to: () => ({ pathname: `${INVENTORY}/locations`, params: { tab: 'rooms', code: null, room: null, new: null } }) },
      { id: 'racks', label: 'Racks', icon: ShelvingUnit, to: () => ({ pathname: `${INVENTORY}/locations`, params: { tab: 'movable', code: null, room: null, new: null } }) },
      { id: 'map', label: 'Map', icon: Layers, to: () => ({ pathname: `${INVENTORY}/locations`, params: { tab: 'map', code: null, new: null } }) },
      { id: 'labels', label: 'Labels', icon: Barcode, to: () => ({ pathname: `${INVENTORY}/locations`, params: { tab: 'labels', code: null, room: null, new: null } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      if (
        pathname.startsWith(`${INVENTORY}/locations`) ||
        pathname === '/warehouse' ||
        pathname.startsWith('/warehouse/')
      ) {
        const tab = params.get('tab');
        if (tab === 'rooms') return 'rooms';
        if (tab === 'movable') return 'racks';
        if (tab === 'map') return 'map';
        if (tab === 'labels' || tab === 'bays' || tab === 'racks') return 'labels';
        return 'locations';
      }
      return 'locations';
    },
  },
  // ── QC labels (Warehouse lane) ─────────────────────────────────────────────
  // One record per labelled serial unit: the QC / pre-box sticker (unit_uid +
  // serial) the picker scans, which binds that serial to the order at pick.
  {
    id: 'qc-labels', label: 'QC labels', href: QC_LABELS_PATH, icon: ScanBarcode, tone: 'text-amber-600', kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view',
    railless: true,
    children: [
      { id: 'all',   label: 'All',        icon: ScanBarcode,  to: () => ({ pathname: QC_LABELS_PATH, params: { view: null } }) },
      { id: 'stock', label: 'In stock',   icon: Package,      to: () => ({ pathname: QC_LABELS_PATH, params: { view: 'stock' } }) },
      { id: 'order', label: 'On orders',  icon: PackageCheck, to: () => ({ pathname: QC_LABELS_PATH, params: { view: 'order' } }) },
    ],
    resolveChild: ({ params }) => {
      const view = params.get('view');
      return view === 'stock' || view === 'order' ? view : 'all';
    },
  },
  // Data Wipe (`/wipe`) is temporarily absent from master nav — revisit when the station UX is ready for general rollout.
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
  'stations-live',
  'triage',
  'receive',
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
