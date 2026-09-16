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
  Sparkles,
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
import { SHIPPING_EXCEPTIONS_PATH, SHIPPING_ORDERS_PATH, SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
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

/**
 * Stations category under the spine (`SidebarNavList` + guard).
 *
 * **`floor` is the only station group.** The old `desk` twin was a grab-bag —
 * "everything pointer-driven" is not a domain, so it collected Incoming, Review,
 * Support, Shipping, Dashboard, Stock and Products behind one label an operator
 * could not predict. Those pages moved to {@link DOMAIN_GROUPS} (2026-08-01,
 * `docs/todo/desk-domain-spine-split-CLAUDE-CODE-PROMPT.md`). Scan Stations
 * stays a group of its own because it is not a domain either: it is the
 * scanner-driven INPUT MODEL, and a bench must never be reachable only by way
 * of the domain whose records it happens to touch.
 */
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

/**
 * Main category ids under the spine — Operations, then Studio at the end of
 * the map.
 *
 * **Workflow Studio left the footer pin band (2026-08-29).** It is an
 * ordinary L1 row after Inventory. Settings is parked (`kind: 'top'`,
 * `spineBand: false`) and lives in the staff account ⋯ menu — the footer is
 * identity only. `/studio/catalog` stays an L2 child of `studio` in
 * {@link SIDEBAR_PAGE_NAV} (⌘K, header Mode, URL).
 */
export type MainGroupId = 'monitor' | 'studio';

/**
 * Spine list imports this — never hard-code the label in the render path.
 * Parallel to {@link STATION_GROUPS}. Render order is {@link SPINE_SECTIONS}.
 *
 * `'Monitor'` since Track R1 (2026-09-15): Reports joined this lane, and a
 * parent and a child never wear the same name — `Operations › Operations ·
 * Reports` fails the nav-name gate outright. The lane names the DIRECTION
 * (watch the building), the rows name the objects: Operations = live/now;
 * Reports = dated, per-entity, exportable. It kept `'Operations'` while it
 * was single-page precisely because a lone page renders flat (no collision).
 */
export const MAIN_GROUPS = [
  { id: 'monitor', label: 'Monitor', icon: ChartPie },
  { id: 'studio', label: 'Automations', icon: Workflow },
] as const satisfies ReadonlyArray<{
  id: MainGroupId;
  label: string;
  icon: SidebarIconComponent;
}>;

/**
 * Optional peer tags on floor benches (Arrival · Unbox / Local Pickup ·
 * Repair Service / Quality Control · Ready to Pack). The Scan Stations drill
 * and the header page switcher list benches as a flat map — no nested
 * Receiving / Walk-In / Testing headers.
 *
 * Tags remain on the page rows for older callers; display uses
 * {@link floorStationPages}.
 */
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

/**
 * The lane registry moved to `@/lib/nav/lanes` on 2026-09-14 so the `/m`
 * drawer can read a lane's label and PARENT icon without importing this file.
 * One taxonomy, two surfaces — that is SURFACE_LAW's frame law applied to nav
 * data rather than to a component.
 */

/**
 * Spine sections — Scan Stations, then the lane order the operator reads
 * top-to-bottom: **Inbound → Outbound → Inventory → Products → Sales →
 * Support → Operations**, then Automations. Compose from the three group
 * registries; never twin a label in the render path.
 *
 * Scan Stations is an INPUT MODEL; the rest are DOMAINS (Operations is the
 * monitor altitude, and keeps its `'Operations'` label until Reports joins that
 * lane — a single-page lane rendering as *Monitor* would rename a row for no
 * gain). Studio sits at the end of the map — the footer pin band is gone.
 *
 * A section with no visible page renders nothing (permission-filtered or empty).
 */
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
  /**
   * `kind: 'top'` only. When `false`, the pin stays in the registry (⌘K,
   * dest search, deep links) but is not painted as a spine map row.
   * Omit / `true` = paint Home / Media Library at the top of the map.
   * Parked surfaces (Search, Plans, Chat, Settings) use `false`.
   */
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

/**
 * Flat spine row. `kind: 'top'` = Home/Media Library (and parked Search/Plans/Chat/Settings);
 * `kind: 'bottom'` is unused on the default map (the pin band is gone — identity
 * footer only); `kind: 'main'` requires `mainGroup` (Operations / Studio);
 * `kind: 'station'` requires `stationGroup` (Scan Stations) and may set
 * `stationSubgroup` (header page-switcher peers); `kind: 'domain'` requires
 * `domainGroup` (Inbound · Catalog · Inventory · Fulfillment · Sales · Support).
 * Section order: {@link SPINE_SECTIONS}.
 *
 * Top pins with {@link SidebarNavItemFields.spineBand} `false` stay in ⌘K /
 * dest search but are not painted as map rows.
 *
 * The retired `stock` / `products` / `labels` / `documents` kinds were membership
 * by *page shape* rather than by domain, which is why they all had to be
 * special-cased in `spineSectionIdForPage`. One field answers it now.
 */
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

/**
 * Dogfood prod surface (stations + shipping + inventory + warehouse + thin support).
 *
 * Dogfood parking is retired: Home · Media Library paint as map rows at the
 * top of the spine. Search / Plans / Chat stay `kind: 'top'` with `spineBand: false`
 * (⌘K + routes, no row). Operations / Sourcing / Studio ship live. Routes +
 * SIDEBAR_PAGE_NAV modes may still resolve for deep-links — do not delete those
 * until a surface is archived.
 *
 * **RULING RETIRED 2026-09-14** (operator: *"outbound should be a parent and it
 * should display FBA page and shipping"*). The old rule read: *"`/fba` stays off
 * the spine because it permanently redirects into Shipping (no second front
 * door)."* It was right about `/fba` and wrong about FBA: the redirect hop is
 * not the surface. `/shipping/fba` is a real page, and it is now a row in the
 * **Outbound** lane pointing at that real route — never at `/fba`, which stays a
 * bookmark rehome with no spine row. Making Outbound a parent of two pages is
 * what the operator asked for, and what the redirect ruling was protecting
 * against (two doors to one page) is handled instead by DELETING the Amazon Prep
 * tab from the Shipping desk — see the `outbound` entry in
 * {@link SIDEBAR_PAGE_NAV}.
 *
 * Studio and Admin are map rows (2026-08-29); Settings is parked in the
 * account ⋯ menu (`spineBand: false`). `/studio/catalog` stays an L2 mode.
 */
export const APP_SIDEBAR_NAV: SidebarNavItem[] = [
  // Top map rows — Home → Media Library. Search / Plans / Chat / Settings stay
  // registry rows (`spineBand: false`) so ⌘K and those routes still work.
  // Search lives in GlobalHeader (`GlobalHeaderSearch`); a spine row would
  // duplicate that control. Plans deep-links Home forge
  // (`/?mode=forge&view=live`); active state is query-aware via
  // {@link isSidebarTopPinActive} if the glyph returns.
  { id: 'home',              label: 'Daily',           href: '/',                   icon: ListChecks,      kind: 'top' },
  { id: 'search',            label: 'Search',         href: '/search',             icon: Search,          kind: 'top', spineBand: false },
  { id: 'ops-photos',        label: 'Media Library',  href: '/ops/photos',         icon: Images,          kind: 'top', requires: 'photos.view', keywords: ['photos', 'photo library', 'images', 'assets', 'gallery'] },
  // Plans — live master-plan console (Home forge). Same landing as `/forge`.
  { id: 'plans-live',        label: 'Plans',          href: '/?mode=forge&view=live', icon: Zap,           kind: 'top', spineBand: false, requires: 'operations.plans.view' },
  // Chat — streaming assistant workspace; `/ai` shares it.
  { id: 'ai-chat',           label: 'Chat',           href: '/ai-chat',            icon: MessageSquare,   kind: 'top', spineBand: false, requires: 'dashboard.view' },
  // Settings — parked off the map; the staff ⋯ menu is the spine door.
  { id: 'settings',          label: 'Settings',    href: '/settings',           icon: Settings,        kind: 'top', spineBand: false },
  // Monitor — TV / observe-only Operations Live (+ Analytics / History / …).
  { id: 'operations',        label: 'Operations',  href: '/operations',         icon: Monitor,         kind: 'main', mainGroup: 'monitor', requires: 'operations.view' },
  // Reports — DATED, per-entity, exportable tables (Staff day · Bin
  // utilization · Velocity · Dead stock).
  //
  // **A PARENT-LEVEL row, not a Monitor member** (operator 2026-09-15:
  // *"remount the reports parent level sidebar"*). It was a `mainGroup:
  // 'monitor'` sibling of Operations, which cost a chevron to reach and filed
  // the record under the live board. The two answer different questions —
  // Operations owns live/now, Reports owns the record, and neither links to
  // the other as an alias (Track R1) — so nesting the record inside the
  // monitor never paid for the extra tap.
  //
  // `kind: 'top'` (band-visible, so `isSpineMapTopRow`) puts it beside Daily
  // and Media Library: structural rows above the reorderable lane band. It is
  // deliberately NOT slottable — `isSpineSlottable` returns false for every
  // `top` row, so a manager's saved spine order cannot bury the record again.
  //
  // Monitor keeps its lane: `/operations` declares children, which satisfies
  // the "every desk lane is expandable" contract with one page.
  //
  // Permission is unchanged — `operations.view`, the same gate as the phone's
  // `/m/reports` leaf, so the two doors still answer to one rule.
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
  // ── Inbound ───────────────────────────────────────────────────────────────
  // The pointer-driven COUNTERPART of the receiving benches: what is on its way
  // and what landed. The benches themselves stay on Scan Stations (D6) — a
  // scanner surface must never be reachable only through the domain it feeds.
  //
  // **Faced `Deliveries`, not `Inbound` (operator 2026-09-14).** This row sits
  // INSIDE the Inbound lane, and the older ruling *"Face is Inbound everywhere
  // (wire id / path stay `incoming`)"* printed that one word at three
  // altitudes: lane `Inbound` → row `Inbound` → tab `Inbound`. The operator's
  // ruling: *"it should never display the same child and parent name."* So each
  // altitude now answers a different question — the LANE names the direction
  // (Inbound), the ROW names the object (Deliveries), the TAB names the state
  // (On the way · History · PO Mailbox). Wire id and path stay `incoming`.
  // Enforced by `nav-name-collisions.ts`, not by vigilance.
  // `keywords` carry the RETIRED face: the row is no longer called Inbound, but
  // an operator who types "inbound" in ⌘K must still land on it. Renaming a
  // face without carrying its old word into search is how a rename reads as a
  // deletion.
  { id: 'incoming',          label: 'Deliveries', href: '/incoming',           icon: RECEIVING_NAV_ICONS.incoming, kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view', keywords: ['inbound', 'incoming', 'arrivals', 'on the way', 'cartons', 'deliveries'] },
  // ── Catalog ───────────────────────────────────────────────────────────────
  // Manage Products. Label is "Catalog" (D11); the browse mode inside it is
  // "Reference" so the section and its default mode don't answer to one word.
  // Absorbs the former Print Labels (product) + Print Documents (manuals) rows —
  // both were aliases of `/products` views that this page already owned.
  { id: 'products',          label: 'Products',    href: '/products',           icon: Tags,            kind: 'domain', domainGroup: 'catalog', requires: 'sku_stock.view' },
  // ── Inventory ─────────────────────────────────────────────────────────────
  // Physical stock + Locations.
  { id: 'inventory',         label: 'Inventory',   href: '/inventory',          icon: ShelvingUnit,    kind: 'domain', domainGroup: 'inventory', requires: 'sku_stock.view' },
  // Sourcing rides the INBOUND lane (N4, operator 2026-09-14): demand → PO →
  // on the way → received is one direction. The 2026-08-03 ruling only kept it
  // out of *Inventory*; the row itself is unchanged.
  { id: 'sourcing',          label: 'Sourcing',    href: '/sourcing',           icon: ShoppingCart,    kind: 'domain', domainGroup: 'inbound', requires: 'sourcing.view' },
  // Locations folded under Inventory L2 (`/inventory/locations`) — P4 condensation.
  // ── Shipping (fulfillment) ────────────────────────────────────────────────
  // Orders leaving the building. Carrier postage lives here — not a print task.
  // Lands on the To-ship desk, not Labels: the queue is the status overview an
  // operator opens Shipping to see, and the interaction budget puts a status
  // overview at ≤1. Labels stopped being a tab on 2026-08-30.
  { id: 'outbound',          label: 'Shipping',    href: SHIPPING_ORDERS_PATH, icon: STATION_PAGE_ICONS.outbound,  kind: 'domain', domainGroup: 'fulfillment', requires: 'shipping.view' },
  // FBA rides the Outbound lane beside Shipping (operator 2026-09-14). The href
  // is the DESK route `/shipping/fba`, not `/fba` — that one is a redirect hop,
  // and pointing a nav row at it would reintroduce exactly the second front
  // door the retired ruling was about. `fba.view` gates it, so a role without
  // Amazon Prep sees Outbound collapse back to a single Shipping row.
  { id: 'fba',               label: 'FBA',         href: OUTBOUND_MODE_PATHS.fba, icon: SHIPPING_NAV_ICONS.fba, kind: 'domain', domainGroup: 'fulfillment', requires: 'fba.view' },
  // ── Sales ─────────────────────────────────────────────────────────────────
  // Own root (D4) — front-desk history, not a fulfillment lane. Feeds live on
  // `/dashboard` (`?mode=sales|pickup|repairs`); the row is gated on the ROUTE
  // permission because a nav row that 403s is worse than an absent one, and the
  // children carry front-desk / repair gates as mode `requires`.
  { id: 'sales',             label: 'Sales',       href: `/dashboard?mode=${DASHBOARD_SALES_MODE}`, icon: SalesPrice, kind: 'domain', domainGroup: 'sales', requires: 'dashboard.view' },
  // Counter is a Sales child (`SIDEBAR_PAGE_NAV`), not its own L1 row.
  // ── Support ───────────────────────────────────────────────────────────────
  // Own root (D3). Visible with Zendesk tickets *or* warranty (Warranty Logger
  // lives under Support). `/support` mounts SurfaceGate + RouteShell like the
  // stations do, and stays desktop-only (mobile-restricted).
  { id: 'support',           label: 'Support',     href: '/support',            icon: AlertCircle,     kind: 'domain', domainGroup: 'support', requires: 'integrations.zendesk' },
  // ── End of map (was footer pins) ──────────────────────────────────────────
  // Automations (href stays /studio). Catalog sub-route is an L2 child in
  // SIDEBAR_PAGE_NAV (⌘K / header Mode / URL). Desktop-only (pan/zoom canvas);
  // MOBILE_RESTRICTED_SIDEBAR_IDS enforces.
  { id: 'studio',            label: 'Automations', href: '/studio',         icon: Workflow,        kind: 'main', mainGroup: 'studio', requires: 'studio.view', spineFlat: true },
  // Audit Log is no longer a top-level sidebar row — it lives under Operations
  // › Logs (AdminLogsTab, with the Audit filter). The /settings/audit and
  // /audit-log/* routes still resolve directly.
  //
  // Admin is DISSOLVED: every section found its one true home and `/admin` is
  // a redirect table. No spine row — permission is `requires` on rows, not a
  // destination.
];

export function isSidebarRouteMobileRestricted(routeKey: SidebarRouteKey): boolean {
  return MOBILE_RESTRICTED_SIDEBAR_IDS.has(routeKey);
}

export interface GetSidebarNavItemsOpts {
  mobileRestricted?: boolean;
  /**
   * Set of permission strings the current user holds. When provided, items
   * whose `requires` is not in the set are filtered out. When undefined
   * (unauthenticated, or pre-sign-in shadow mode), no permission filtering
   * is applied — preserves legacy behavior for the rollout window.
   */
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
  // THE MOBILE-FIRST GATE (operator 2026-09-14): a lane the phone cannot run
  // gets no door at all — *"if it is not mobile friendly, then it should not
  // even display anywhere within the front end … no links to it."* Applied
  // HERE because every nav consumer funnels through this function: the spine,
  // the ⌘K palette, `nav-destinations`, the header page switcher and recents.
  // Filtering only the spine would have left three other doors open.
  //
  // The ROUTES still resolve — hiding a door is not deleting a surface (see
  // `LANE_MOBILE_FIRST`). Flipping one entry there restores the row.
  items = items.filter((item) => isLaneVisible(spineSectionIdForPage(item) ?? ''));
  return items;
}

/**
 * Route keys that render the **two-card station column** (nav card on top,
 * recents + scan bar card below) instead of the classic single sidebar panel.
 *
 * Exactly the station benches an operator scans at. Derived by route KEY, not
 * by path prefix — `receiving` covers `/unbox`, `/triage`, `/incoming`,
 * `/pickup`, `/repair` and `/receiving/*` (L1 nav ids differ; see
 * {@link getSidebarNavPageId}).
 *
 * Kept here beside {@link getSidebarRouteKey} so the sidebar shell can ask the
 * question without importing any station's own mode logic.
 */
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
 *
 * One question: *does this surface still need a left column to navigate itself?*
 * A page that does not answers by declaring `railless: true`.
 *
 * 1. **The Shipping desk** — its recents rail was retired when the desk stage
 *    was measured to give that width back. A 360px column beside it is width
 *    the measure already spent.
 * 2. **`/incoming`** — the Inbound desk, rail-less since before desk chrome
 *    existed. It used to need a hand-written path clause here because it shares
 *    the `receiving` route key with the scan stations; it now declares
 *    `railless: true` like everyone else, which is the same fact without the
 *    exception.
 *
 * ## Why this reads `railless` and no longer reads `deskChrome`
 *
 * It used to derive off the desk-chrome opt-in, and that was right while
 * Shipping was the only desk wearing the chrome — the two were one commit, so
 * one flag looked like one fact. The port to the other desks proved they are
 * two: Products, Inventory, Sourcing and Operations wear the same page chrome
 * and navigate BY their rail (the manual picker, the SKU picker and the
 * exception list write the `?id=` / `?skuId=` / `?open=` their bodies read).
 * Deriving would have deleted the navigator on the commit that gave them a
 * title row (operator ruling 2026-08-31: keep the rail, decouple the flags).
 *
 * So a desk now says which it is. The cost of the split is one honest
 * declaration per page; the cost of the derivation was four broken surfaces.
 *
 * **Most scan stations keep their rail** (Unbox / Pack / QC / Triage) — they
 * declare neither flag. **Scan out is the exception:** it opts into
 * `railless: true` for the mobile-first composer grammar (full-bleed center +
 * bottom scan dock, no left recents).
 *
 * Media Library (`/ops/photos`) is also rail-less but drops from
 * {@link CONTEXT_PANEL_ROUTE_KEYS} instead — it is not a desk-chrome page.
 * Frame consumer: `ContextPanelLayout` via `useIsRaillessSurface`.
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
  // Support's ticket alias (`?context=support`) claims this URL for the spine
  // pin / desk title, but the stage is still the Shipping To-ship desk. That
  // claim must not resurrect the Focus + Saved views recents rail Shipping
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

/**
 * Route keys whose sidebar spine carries a per-route **context panel** — a
 * picker / rail that is the route's primary navigator (Products' catalog list,
 * the dashboard order feed, Inventory's tabs, …). Exactly the keys
 * {@link getSidebarRouteKey} maps to a panel in `SidebarContextPanel`, minus the
 * station keys (their bench renders in the CONTENT region, not the spine).
 *
 * This is the **declared contract** the shell was missing: before it existed the
 * only way to learn whether a route had a panel was to mount it, so every route
 * reserved a 360px column and a panel-less surface (Media library, /reports,
 * every scan deep-link) rendered 360px of empty chrome beside its content.
 *
 * It drives ONE thing: the **default pin state** of the spine. Whether a body
 * actually renders stays the panel's own call at render time — a mode-scoped
 * `null` (e.g. `/dashboard?mode=inbound`) falls back to the nav list rather than
 * going blank, so this set never has to model params.
 */
const CONTEXT_PANEL_ROUTE_KEYS = new Set<SidebarRouteKey>([
  // `home` dropped 2026-08-12 — Today is rail-less (Pattern E). Saved views
  // sit on Band 3 `WorkbenchViewsMenu`; nothing is left for a left column
  // that chrome cannot say. Same mechanism as `/ops/photos`.
  //
  // `search` DROPPED 2026-08-30 — back to rail-less (Pattern E), the same
  // mechanism as `home` above and `/ops/photos` below.
  //
  // It was added 2026-08-20 to hold recent finds, on the argument that "the
  // header dropdown is not that reach". ⌘K now carries its own Recent group,
  // which is that reach — one chord, on every route, not just this one. So the
  // column was holding a second copy of a list the palette already shows, and
  // the key is what reserved 360px for it. Removing the key collapses the
  // column outright rather than painting it empty.
  'dashboard',
  'operations',
  'studio',
  'ai-chat',
  // `settings` DROPPED 2026-09-10 — Pattern E card landing + /settings/me.
  // Roles/Access still need their picker rails; those paths are special-cased
  // in hasSidebarContextPanel below (the route key stays `settings`).
  'audit-log',
  'fba',
  // `inventory` DROPPED 2026-09-15 — operator: collapse the left rail on every
  // inventory mount (ledger · triage · pulse · graph · replenish · locations).
  // Same Pattern E as Incoming / Media library: drop the key so the column
  // does not reserve 360px. `railless: true` on the page nav is the other half.
  // `warehouse` dropped with it — `/warehouse` already resolves to `inventory`.
  'sourcing',
  'products',
  // `walk-in` dropped — `/walk-in` is a redirect shell; sales context rides
  // the dashboard panel (`WalkInHistorySidebar` when domain === sales).
  // (`manuals-library` dropped — `/manuals/library` was a bookmark-only second
  // copy of the manuals library, deleted 2026-08-01. The surface lives at
  // `/products?view=manuals`.)
  // `ops-photos` dropped 2026-08-09 — the Media library is RAIL-LESS (Pattern
  // E). Its facet rail held lifecycle scope + capture day; the scopes are now
  // Band-1 tabs and the days ride the Band-2 refine popover, so nothing is left
  // for a left column to hold that the chrome cannot say. Removing the key is
  // the honest mechanism — the same one `/search` and `/reports` already use;
  // `isRaillessSurface` is not the lever here (the Media library is not a
  // desk-chrome page, so it has no opt-in to read). SoT:
  // `/search` is header find + browse/detail in main (no context rail)
  // when `?sel=` is set. See `SearchBrowseShell` / `SearchDetailWorkspace`.
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

/**
 * MasterNav L1 page id for the current path. Receiving-family routes resolve to
 * their promoted station pages (`triage` / `receive` / …); Testing family
 * routes resolve to `testing` / `ready-to-pack` from `?view=`. Everything else
 * matches {@link getSidebarRouteKey}.
 *
 * `/products?view=labels` resolves to **`products`** (Catalog). It used to
 * resolve to a `print-labels` row so a Print Stations drill would stick — that
 * row is gone, and Catalog → Labels is the one home for product label work.
 */
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
  // Dashboard boards dissolved into their domain homes (D5): `/dashboard` has no
  // L1 row of its own, so the `?mode=` DOMAIN decides which page owns the URL.
  // The route + its `?mode=` wire values are untouched — every bookmark still
  // opens the same board; only the nav identity moved.
  // Counter desk is a Sales child (`/counter`), not its own L1.
  if (pathname === '/counter' || pathname.startsWith('/counter/')) return 'sales';
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    const domain = String(searchParams?.get('mode') ?? '').trim().toLowerCase();
    if (domain === 'inbound' || domain === 'receiving') return 'incoming';
    if (domain === 'sales' || domain === 'pickup' || domain === 'repairs') return 'sales';
    // Bare / `?unshipped` / `?shipped` / legacy `?pending` = the outbound orders
    // queue, which Fulfillment owns.
    return 'outbound';
  }
  // Review splits by `?mode=` (D10): packing QA is Operations › Packing Review
  // (desk KPI / queue); pairing and catalog-link are Products' work. The
  // `/review` page and its three modes are untouched — only which nav row
  // claims the URL.
  //
  // `catalog-link` still resolves to `products` after its *Listing match* TAB
  // was removed (2026-09-15). The header keeps naming the desk the work belongs
  // to while the tab band lights nothing — the same honest shape the ex-admin
  // inventory desks wear. Re-pointing this at `operations` would put the
  // operator under a Packing Review header they never opened.
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
  if (outboundMode) return 'outbound';
  if (pathname === '/shipping/orders' || pathname.startsWith('/shipping/orders/')) return 'outbound';
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

/**
 * MasterNav L1 row ({@link APP_SIDEBAR_NAV}) for a page id.
 * Desk children and legacy `SIDEBAR_PAGE_NAV` family pages (`tech`, `receiving`)
 * are not faces — Recents, Pins, and chrome titles must use this, not a
 * parallel title map.
 */
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

/**
 * Top-pin active state.
 *
 * This used to be query-aware: Plans landed on `/?mode=forge&view=live`, so both
 * it and Home matched `href: '/'` under pathname-only
 * {@link isSidebarNavActive}, and this function split them on `?mode=`. Plans
 * moved to its own `/forge` route on 2026-08-19, so the two pins no longer
 * collide on one path and every pin is plain pathname matching again.
 *
 * Kept as the pin renderer's entry point rather than inlined, so a future pin
 * that DOES need location context has a declared seam to grow into.
 */
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

/**
 * The Workspaces lanes, in {@link SPINE_SECTIONS} order — Inbound → Outbound →
 * Inventory → Products → Sales → Support → Operations.
 *
 * Exported so the render path never filters `SPINE_SECTIONS` inline. That inline
 * filter is exactly how the spine ended up with TWO orders: `SPINE_SECTIONS`
 * drove the ⌘K bands while `SidebarNavList` painted `otherPages` in
 * `APP_SIDEBAR_NAV` order. One list, one order, one place to change it.
 */
export const DESK_SPINE_SECTIONS = SPINE_SECTIONS.filter(
  (section) => isDeskSpineSection(section.id) && isLaneVisible(section.id),
);

/** @deprecated Prefer {@link isSpineMapTopRow} — the spine band icons are gone. */
export const isSpineBandTopPin = isSpineMapTopRow;

/**
 * Route → required permission map. Used by middleware to redirect users to
 * `/not-authorized` if they navigate (via URL) to an area they can't access,
 * and by per-page guards as a single source of truth.
 *
 * Entries are checked in order; the first prefix match wins. Add new entries
 * with the longest path first (e.g. `/admin/staff` before `/admin`).
 */
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
  { prefix: '/ai-chat',            permission: 'dashboard.view' },
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

/* ═══════════════════ MASTER SIDEBAR NAV — page + child page ═══════════════════
 *
 * Single source of truth for a page's CHILD PAGES (see
 * docs/design-system/master-sidebar-nav-migration-plan.md). Each page that owns
 * children declares them here, plus the two halves of its URL contract:
 *   • `to()`   — how navigating to a child mutates the URL (the WRITE path).
 *   • `resolveChild()` — how the active child is read back from a location (the
 *     READ path). This MIRRORS the panel's own derivation today so deep-links
 *     resolve identically; panels will eventually import this instead of
 *     re-implementing `getReceivingModeFromLocation` / `resolveFbaMode` / etc.
 *
 * ## Why these are CHILD PAGES and not "modes" (renamed 2026-08-03)
 *
 * The answer was already in the code: every child carries `to(): { pathname,
 * params }` and every parent carries `resolveChild(location)`, and the two
 * round-trip. They are distinct, deep-linkable, reload-safe URLs — `nav-
 * destinations.ts` says it outright: `/products?view=qc` is a PLACE, not a
 * setting. The spine flatten (2026-08-02) made that structural: a child is now
 * an ordinary spine row beside its parent, so calling it a "mode" described a
 * drill that no longer exists.
 *
 * ## The one thing that did NOT change: `?mode=` on the wire
 *
 * `?mode=` is a live URL contract. `/dashboard?mode=sales`,
 * `/support?mode=voicemail` and `/review?mode=catalog-link` are bookmarked, and
 * `getSidebarNavPageId` parses them to decide which page owns a URL. **Never
 * rename a param key or a param value.** This rename covers the CONCEPT and the
 * identifiers around it, never the wire.
 *
 * Worth naming the seam: `?mode=` on `/dashboard` and `/support` means "which
 * DOMAIN", while a child page here means "which CHILD PAGE". Two meanings, one
 * word — which is itself most of the argument for dropping the nav-side one.
 *
 * P0 (this file) is pure data + pure functions — no components, no router.
 * The round-trip invariant `resolveChild(apply(to(child))) === child` is
 * enforced by sidebar-navigation.test.ts so the halves can never diverge.
 */

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
  /*
   * There is deliberately NO `parked` field here. A withdrawn tab door is a
   * LEDGER entry in `@/lib/nav/parked-tabs` — the same shape as a hidden lane
   * in `LANE_MOBILE_FIRST`, and for the same reason: the porting backlog has
   * to be readable in one file, not scattered across the registry as a flag
   * per child. See {@link filterPageChildren}, the one funnel that reads it.
   */
}

export type SidebarPageNav = SidebarNavItem & {
  /** This page's child pages. Omitted for single-surface pages. */
  children?: SidebarChildPage[];
  /**
   * Opted in to **desk page chrome**
   * (`docs/todo/desk-page-chrome-fixed-width-PLAN.md`): the page draws its own
   * `children` as IN-PAGE TABS via `DeskPageChrome`, so the spine row stays a
   * flat leaf and the header face stays an identity chip.
   *
   * The children stay declared here — they are still the tab list, still the
   * deep-link contract (`to()` / `resolveChild()`), and still what Recents
   * replays. Only the two NAV doors onto them are withdrawn, because a desk
   * that tabs its own pages does not need the nav to tab them a second time.
   *
   * Never set on a `kind: 'station'` entry: scan stations stay edge-to-edge and
   * keep their modeless spine leaf.
   */
  deskChrome?: true;
  /**
   * Runs **rail-less** — Pattern E, no 360px left context column.
   *
   * Separate from {@link deskChrome} since 2026-08-31, and the split is the
   * whole point. They were one flag while Shipping was the only desk wearing
   * the chrome, and reading one off the other was defensible then: Shipping's
   * rail had been retired, so "wears the chrome" and "has no rail" were the
   * same commit.
   *
   * They are not the same fact. Products, Inventory, Sourcing and Operations
   * wear the same page chrome and NAVIGATE BY THEIR RAIL — the manual picker,
   * the SKU picker, the exception list all write the `?id=` / `?skuId=` /
   * `?open=` their bodies read. Deriving rail-less from the chrome opt-in would
   * have deleted the navigator on the commit that gave them a title row.
   *
   * The measures do not fight: {@link DESK_STAGE_MAX_PX} is a CAP, not a width,
   * so beside a rail the stage simply never reaches it.
   *
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
// Unbox + Triage graduated to their own first-class surface routes
// (operator-surfaces refactor Phases 1–2); those modes navigate to them. Pickup +
// History graduated in Phase 9 (`/pickup`, nested `/receiving/history`). The whole
// receiving family now navigates via first-class routes, so no bare `/receiving`
// const remains.
const UNBOX = '/unbox';
const TRIAGE = '/triage';
const PICKUP = '/pickup';
const REPAIR = '/repair';
const INCOMING = '/incoming';
const INVENTORY = '/inventory';
const SOURCING = '/sourcing';
const PRODUCTS = '/products';
// Testing graduated to its own first-class surface route (`/test`,
// operator-surfaces refactor Phase 8); its modes navigate there (the `?view=`
// sub-mode rides along). Legacy `/tech` still resolves (proxy redirect + shared
// page). Renamed const so the page href + every mode `to()` land on `/test`.
const TECH = '/test';
const SUPPORT = '/support';
// Packing graduated to its own first-class surface route (`/pack`,
// operator-surfaces refactor Phase 7); its modes navigate there. Legacy
// `/packer` still resolves (proxy redirect + shared page).
const PACK = '/pack';
const REVIEW = '/review';

export const SIDEBAR_PAGE_NAV: SidebarPageNav[] = [
  // ── Daily (was Home) ──────────────────────────────────────────────────────
  //
  // Single-surface as of 2026-09-14: the Today and Tasks modes are unmounted
  // (files and backends stay; deletion is a separate gated pass) and Home IS
  // the daily checklist — so the spine row itself is "Daily" with the lucide
  // ListChecks glyph, matching the L1 pin above.
  //
  // History so the next move doesn't re-litigate it: the modes rode a
  // full-width `HorizontalButtonSlider` band (banned twin of the GlobalHeader
  // control), then the desk frame's tab row, and now they are gone — each
  // step the same doctrine: a switcher slot is not free, and a mode earns one
  // by being opened.
  //
  // NO children and NO `resolveChild`: the desk frame draws a header and a
  // card with no tab row, which is the honest shape for a single-surface desk
  // (`useDeskPageChromeTabs`). A stale `?mode=today|tasks|forge` deep link
  // lands on Daily via `parseHomeMode` — see `home-modes.ts`.
  //
  // No `railless` — `home` is absent from CONTEXT_PANEL_ROUTE_KEYS, so there
  // is nothing to declare.
  {
    id: 'home', label: 'Daily', href: '/', icon: ListChecks, kind: 'top',
    deskChrome: true,
  },
  // ── Sales (front-desk history) ────────────────────────────────────────────
  // The `/dashboard` sales domain, promoted to its own root section (D4). Wire
  // values `?mode=sales|pickup|repairs` — Sales/Pickup thin feeds + Repairs
  // RepairTable history door (station `/repair` stays the intake/task door).
  //
  // The row is gated on `dashboard.view` (the ROUTE gate) while the feeds carry
  // `walk_in.view` / Repairs `repair.view`, because no single `requires` can
  // express both. A page whose every mode is filtered away is dropped wholesale
  // by {@link isSidebarPageReachable} rather than shown as a dead header — that
  // is C10 ("absent, not a disabled pill") one level up.
  {
    id: 'sales', label: 'Sales', href: `${DASHBOARD}?mode=${DASHBOARD_SALES_MODE}`, icon: SalesPrice,
    kind: 'domain', domainGroup: 'sales', requires: 'dashboard.view',
    // Desk page chrome (2026-08-31): Counter · Sales Board · Local Pickup ·
    // Repair Service are drawn as IN-PAGE tabs, so the spine row stays a flat
    // leaf.
    //
    // Every child resolves to THIS page — three are `/dashboard?mode=` and
    // `/counter` maps to `sales` in `getSidebarNavPageId` — so the tab row
    // survives every switch. Local Pickup and Repair Service are the dashboard
    // MODES, not the `/pickup` and `/repair` scan benches; those keep their own
    // pages and their own frames.
    //
    // NOT `railless` — the walk-in picker is this desk's navigator.
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
  // ── Operations ────────────────────────────────────────────────────────────
  // `?mode=insights|history|signals`; bare /operations = the Live floor
  // dashboard (default). `analytics` was RETIRED 2026-09-16 — its numbers were
  // not trustworthy (partial-day vs whole-day deltas, hardcoded-zero deltas,
  // labels naming units the queries did not count) and its one reconcilable
  // read moved to `/reports?tab=packer`. The tab is gone from this list, so
  // there is no door to it on any surface.
  // The L2 rail mirrors the right-pane modes
  // (OperationsWorkspace) — SoT `OPERATIONS_MODE_ITEMS`. `plans` is no longer an
  // Operations mode (forge/plans moved to Home, HOME-OPS §3.2) — `?mode=plans`
  // bookmarks still redirect to Home via OperationsWorkspace. Every switch clears
  // the mode-scoped params (search, selection, range, section…) so each mode
  // opens clean — matches Inventory.
  {
    id: 'operations', label: 'Operations', href: OPERATIONS, icon: Monitor, kind: 'main', mainGroup: 'monitor', requires: 'operations.view',
    // Desk page chrome (2026-08-31): the children below are drawn as IN-PAGE
    // tabs by the Operations desk, so the spine row stays a flat leaf.
    // NOT `railless` — this desk navigates by its context rail.
    deskChrome: true,
    children: [
      // Each target used to null twelve sibling keys by hand — the largest of the
      // nine deleted denylists, re-stated once per mode. `/operations` declares
      // OPERATIONS_ROUTE_PARAMS, so `applyChildTarget` CONSTRUCTS from the delta
      // and carries only `staff`; the nulls could not affect the result. Verified
      // byte-identical before and after removal for all five modes.
      { id: 'live',      label: 'Live',      icon: Activity,  to: () => ({ pathname: OPERATIONS, params: { mode: null } }) },
      { id: 'checks',    label: 'Checks',    icon: ClipboardList, to: () => ({ pathname: OPERATIONS, params: { mode: 'checks' } }) },
      // Pack QA desk queue — KPI / exception surface, not a Scan Station.
      // Empty delta: `/review` param spec; bare URL is the packing lane.
      { id: 'packing-review', label: 'Packing Review', icon: ClipboardList, requires: 'packing.review', to: () => ({ pathname: REVIEW, params: {} }) },
      // 'analytics' removed 2026-09-16 — see the note above this entry.
      { id: 'insights',  label: 'Insights',  icon: Sparkles,  to: () => ({ pathname: OPERATIONS, params: { mode: 'insights' } }) },
      { id: 'history',   label: 'History',   icon: History,   to: () => ({ pathname: OPERATIONS, params: { mode: 'history' } }) },
      { id: 'signals',   label: 'Signals',   icon: Zap,       to: () => ({ pathname: OPERATIONS, params: { mode: 'signals' } }) },
      { id: 'reconciliation', label: 'Reconcile', icon: Link2, to: () => ({ pathname: OPERATIONS, params: { mode: 'reconciliation' } }) },
      // ── Absorbed from /admin (dissolution W1) ─────────────────────────────
      // Performance + system observability are monitor work. Each keeps the
      // permission gate its admin row carried; the bodies are the ex-admin
      // tab components mounted by OperationsWorkspace.
      { id: 'goals',     label: 'Goals',     icon: BarChart3, to: () => ({ pathname: OPERATIONS, params: { mode: 'goals' } }) },
      { id: 'quality',   label: 'Quality',   icon: ShieldCheck, requires: 'sku_stock.view', to: () => ({ pathname: OPERATIONS, params: { mode: 'quality' } }) },
      { id: 'staff',     label: 'People',    icon: User, requires: 'admin.manage_staff', to: () => ({ pathname: OPERATIONS, params: { mode: 'staff' } }) },
      { id: 'sync',      label: 'Sync',      icon: Activity, to: () => ({ pathname: OPERATIONS, params: { mode: 'sync' } }) },
      { id: 'logs',      label: 'Logs',      icon: FileText, requires: 'admin.view_logs', to: () => ({ pathname: OPERATIONS, params: { mode: 'logs' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      if (pathname === REVIEW || pathname.startsWith(`${REVIEW}/`)) {
        const mode = String(params.get('mode') ?? '').trim().toLowerCase();
        // Pairing / catalog-link are Products' work — Operations does not claim
        // them. Still true after Listing match lost its tab (2026-09-15): the
        // page identity stayed with Products, so lighting Packing Review here
        // would claim the operator is on a queue they are not.
        if (mode === 'pairing' || mode === 'catalog-link') return null;
        return 'packing-review';
      }
      const m = params.get('mode');
      // An old `?mode=analytics` link resolves to no child and falls through to
      // 'live', matching what OperationsWorkspace renders for it.
      if (m === 'insights') return 'insights';
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
  // ── Reports ────────────────────────────────────────────────────────────────
  // `?tab=staff|utilization|velocity|dead` (Staff day is the default — the
  // report the operator asked for by name), `?date=` rides the staff tab.
  // Children + `resolveChild` are the R1 accept criterion: ⌘K finds "Bin
  // Utilization" via `buildNavDestinations` child flattening, and the spine
  // round-trip invariant holds. `deskChrome` — and ONE tab strip, not two:
  // `DeskPageLayout` resolves `tabs = tabsOverride ?? nav.tabs`, so the page's
  // explicit `tabs={TABS}` prop WINS and the children never paint a second
  // row. They exist for ⌘K, the URL round-trip and Recents — do not delete
  // either half; deleting the children orphans the palette, deleting the prop
  // hands the strip to the nav and silently changes the click path.
  {
    // `kind: 'top'` must match the APP_SIDEBAR_NAV twin above — the two
    // registries are kept in lockstep, and a `main`/`top` split would put the
    // row in the lane band on one code path and above it on the other.
    id: 'reports', label: 'Reports', href: '/reports', icon: BarChart3, kind: 'top', requires: 'operations.view',
    deskChrome: true,
    children: [
      { id: 'staff-day',   label: 'Staff day',       icon: ClipboardList, to: () => ({ pathname: '/reports', params: { tab: null } }) },
      { id: 'utilization', label: 'Bin Utilization', icon: BarChart3,     to: () => ({ pathname: '/reports', params: { tab: 'utilization' } }) },
      { id: 'velocity',    label: 'Velocity (30d)',  icon: TrendingUp,    to: () => ({ pathname: '/reports', params: { tab: 'velocity' } }) },
      { id: 'dead-stock',  label: 'Dead Stock',      icon: FileText,      to: () => ({ pathname: '/reports', params: { tab: 'dead' } }) },
    ],
    resolveChild: ({ params }) => {
      const tab = params.get('tab');
      if (tab === 'utilization') return 'utilization';
      if (tab === 'velocity') return 'velocity';
      if (tab === 'dead') return 'dead-stock';
      return 'staff-day';
    },
  },
  // ── Receiving family (promoted L1 stations; modeless in MasterNav) ────────
  // Former Receiving modes are first-class spine rows. Panel mount still uses
  // route key `receiving` via getSidebarRouteKey. A legacy `receiving` entry
  // below keeps resolveSidebarChild / deep-link mode resolution working for
  // Header/tests that still ask by the family key.
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
  },
  {
    id: 'testing', label: 'Quality Control', href: `${TECH}?view=testing`, icon: TECH_NAV_ICONS.testing,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view',
  },
  {
    id: 'ready-to-pack', label: 'Picker', href: `${TECH}?ship=urgent`, icon: TECH_NAV_ICONS.shipping,
    kind: 'station', stationGroup: 'floor', stationSubgroup: 'testing', requires: 'tech.view',
  },
  // ── Inbound (Manage Inbound) ──────────────────────────────────────────────
  // Single desk at `/incoming`: Pipeline (on the way) + Docked (landed activity,
  // former Receiving Board via `?lane=docked`). Dock BENCHES stay on Scan Stations.
  // Faced **Deliveries** (operator 2026-09-14 — never the same name as its
  // parent lane); wire id / path stay `incoming`.
  {
    id: 'incoming', label: 'Deliveries', href: INCOMING, icon: RECEIVING_NAV_ICONS.incoming,
    kind: 'domain', domainGroup: 'inbound', requires: 'receiving.view',
    // Rail-less since before desk chrome existed, and now DECLARED rather than
    // special-cased inside `isRaillessSurface` (2026-08-31). It shares the
    // `receiving` route key with the scan stations, so the predicate had to name
    // it by path or `isStationSurfaceRoute` would keep reserving a column for a
    // facet rail the chrome already owns. Saying it here is the same fact
    // without the exception.
    //
    // `deskChrome` (operator 2026-09-14): the desk's two LANES are its tab row.
    // Both already existed — the in-transit lane is bare `/incoming`, Docked is
    // `?lane=docked` (the landed-activity trail, what the floor calls History)
    // — but Docked had no way in after the old `Pipeline | Docked` parent pair
    // was deleted, so the whole lane was reachable only by hand-typing a param.
    //
    // Tab labels are **On the way | History | PO Mailbox**. The first was
    // `Inbound` until 2026-09-14, which made the word appear at all three
    // altitudes (lane → row → tab); it now names the STATE the operator is
    // looking at, which is the same reason History is not "Docked".
    //
    // Child ids stay on the lane WIRE (`pipeline` / `docked`), so `to()` and
    // `parseInboundLane` cannot drift. `lane: null` on the default tab drops
    // the param, and `applyChildTarget` constructs from each target's own
    // delta — that is what clears the other lane's `sort` / `rh_*` on a switch
    // without a second copy of `clearCrossLaneParams` here.
    railless: true,
    deskChrome: true,
    children: [
      { id: 'pipeline', label: 'On the way', icon: RECEIVING_NAV_ICONS.incoming, to: () => ({ pathname: INCOMING, params: { lane: null, view: null } }) },
      { id: 'docked',   label: 'History', icon: History,                      to: () => ({ pathname: INCOMING, params: { lane: 'docked', view: null } }) },
      // PO Mailbox (admin dissolution): the ex-admin email-PO triage queue is
      // a third FACE of this desk, not a lane of the carton feed.
      { id: 'mailbox',  label: 'PO Mailbox', icon: Inbox, requires: 'receiving.view', to: () => ({ pathname: INCOMING, params: { lane: null, view: 'mailbox' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      // Legacy `/dashboard?mode=inbound` resolves the PAGE to Inbound but is
      // not on either lane yet — the proxy redirects it. Lighting a tab there
      // would claim the operator is somewhere they are not.
      if (pathname !== INCOMING && !pathname.startsWith(`${INCOMING}/`)) return null;
      if (params.get('view') === 'mailbox') return 'mailbox';
      return parseInboundLane(params.get('lane')) === 'docked' ? 'docked' : 'pipeline';
    },
  },
  // Legacy family entry — deep-link / mode-resolution COMPATIBILITY ONLY.
  // Not in APP_SIDEBAR_NAV. Do NOT use as a display or header-family source:
  // MasterNav + HeaderPageSwitcher derive peers from `stationSubgroup` via
  // {@link stationSubgroupMembers} (Receiving = Arrival·Unbox; Walk-In =
  // Local Pickup·Repair Service). The `incoming` child below is retained for old
  // `?mode=incoming` bookmarks; Inbound is a separate domain row above.
  // Pickup/Repair remain as children for legacy `?mode=` resolve only.
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
  // ── Sourcing (INBOUND lane — N4) ──────────────────────────────────────────
  // `?mode=scout|watchlist`; bare /sourcing = the Queue (demand) surface (default).
  // Legacy keys aliased: `alerts`→queue, `lookup`→scout.
  // `domainGroup` must match APP_SIDEBAR_NAV — existing tests couple the arrays.
  {
    id: 'sourcing', label: 'Sourcing', href: SOURCING, icon: Search, kind: 'domain', domainGroup: 'inbound', requires: 'sourcing.view',
    // Desk page chrome (2026-08-31): the children below are drawn as IN-PAGE
    // tabs by the Sourcing desk, so the spine row stays a flat leaf.
    // NOT `railless` — this desk navigates by its context rail: its pickers
    // write the params this body reads.
    deskChrome: true,
    children: [
      // Each target used to null `q` and `status` by hand — and forgot `by` and
      // `range`, so Scout's field toggle and the Analytics window leaked into
      // every sibling mode. `/sourcing` declares SOURCING_ROUTE_PARAMS, so
      // `applyChildTarget` CONSTRUCTS from the delta and carries only `staff`;
      // the nulls could not affect the result. Verified byte-identical before
      // and after removal for all five modes.
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
  //
  // Promoted to a real spine row 2026-09-14 (operator: *"outbound should be a
  // parent and it should display FBA page and shipping"*). Two consequences:
  //
  // 1. `href` is the DESK route `/shipping/fba` — it used to be bare `/shipping`
  //    with `?mode=fba`, which is a retired param on a path that now redirects
  //    to To ship, so the row would have landed on the wrong desk.
  // 2. `railless: true` is now load-bearing rather than inherited: the rail
  //    question is answered by the page `getSidebarNavPageId` resolves, and
  //    `/shipping/fba` resolves to THIS page now instead of `outbound`. Without
  //    it the FBA board would grow a 360px context column the desk retired.
  //
  // The face is **FBA**, the operator's word. `Amazon Prep` was the tab's name
  // on the Shipping desk and that tab is gone (see `outbound` below).
  //
  // NOT `deskChrome`: the board draws its own stage strip (`?fbaMode=` →
  // Ready · Plan · Combine · Shipped · Catalog, `FbaOutboundWorkspace`), so a
  // desk tab row would state the same navigation twice. These children stay for
  // ⌘K and deep-links only.
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
  // ── Shipping (Manage Shipping — Fulfillment) ──────────────────────────────
  // Pending · To ship · Shipped · Exceptions. Packing Review lives under
  // Operations; Scan out is a Scan Stations L1. Nav id stays `outbound` for
  // bookmark/test stability (route is `/shipping`).
  //
  // **Orders is the former `/dashboard` outbound board** at `/shipping/orders`.
  // Support › To ship aliases the same desk with `?context=support`.
  {
    id: 'outbound', label: 'Shipping', href: SHIPPING_ORDERS_PATH, icon: STATION_PAGE_ICONS.outbound, kind: 'domain', domainGroup: 'fulfillment', requires: 'shipping.view',
    // First adopter of desk page chrome (plan §2.2): To ship · Amazon Prep are
    // drawn as in-page tabs by the desk itself, so the spine row is a flat
    // leaf. `scan-out` is NOT one of these children — it is a Scan Stations L1
    // and stays edge-to-edge.
    //
    // **Labels was removed as a tab (2026-08-30).** Needing a label became a
    // STATE in the To-ship queue (`AWAITING_LABEL` → the "Needs label" pill),
    // so the Labels tab was a second table for a lane that now lives in the
    // first one — and after the awaiting-label backlog was purged it opened on
    // a permanently empty queue. `/shipping/labels` still RESOLVES: the label
    // print/attach flow is reached from an order (`?open=`) and old bookmarks
    // keep working. It is simply no longer a place you navigate to.
    //
    // The L1 lands on To ship, not Labels, and that is now forced rather than
    // chosen: the old landing would have opened a page no tab lights.
    //
    // **Shipped joined as the third peer (2026-08-30.)** To ship = act on open
    // work · Shipped = find and measure what already left. Platforms (Amazon
    // DTC, eBay, Shopify) aggregate as FACETS inside To ship and Shipped and
    // never become peers here.
    //
    // **Amazon Prep was removed as a tab (2026-09-14).** FBA is now a row in
    // the Outbound LANE beside this desk (operator: *"outbound should be a
    // parent and it should display FBA page and shipping"*). Keeping the tab as
    // well would be two doors to `/shipping/fba` — the thing the `deskChrome`
    // law forbids: a desk that tabs its own pages does not need the nav to tab
    // them a second time, and the converse holds once the nav owns the page.
    // `/shipping/fba` still lives inside this `(desk)` route group, so it keeps
    // the frame; its own page entry supplies the title, and it draws no tab row
    // because it is not `deskChrome` — its stages are `?fbaMode=` facets.
    deskChrome: true,
    // Rail-less, and now said out loud rather than derived from the line above
    // (2026-08-31). Shipping's recents rail was retired when the desk stage was
    // measured to give that width back; every other desk that wears this chrome
    // still has a rail to keep.
    railless: true,
    children: [
      { id: 'shortage', label: 'Pending',   icon: AlertCircle,                  requires: 'orders.view', to: () => ({ pathname: SHIPPING_SHORTAGE_PATH, params: {} }) },
      { id: 'orders',   label: 'To ship',   icon: LayoutDashboard,              requires: 'orders.view', to: () => ({ pathname: SHIPPING_ORDERS_PATH, params: {} }) },
      // No `fba` child — FBA is a lane row now (see the docblock above).
      // `packing.view` because the archive IS the packer log: `/api/packerlogs`
      // already enforces it, and a tab that 403s is worse than an absent one.
      { id: 'shipped',  label: 'Shipped',   icon: PackageCheck,                 requires: 'packing.view', to: () => ({ pathname: SHIPPING_SHIPPED_PATH, params: {} }) },
      // Exceptions is a PEER by the same test FBA passes: a process fork whose
      // queue semantics To ship cannot express. Caged / unpaired orders are
      // excluded from that queue by predicate, and the work on them (pair a
      // SKU, fix an item number) is not the work To ship does (pack and ship).
      // It carries a live count so "22 blocked" is legible without navigating.
      { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle,             requires: 'orders.view',  to: () => ({ pathname: SHIPPING_EXCEPTIONS_PATH, params: {} }) },
    ],
    resolveChild: ({ pathname, params }) => {
      // Packing Review is a Scan Stations L1 — never a Shipping child highlight.
      if (pathname === REVIEW || pathname.startsWith(`${REVIEW}/`)) return null;
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
        return 'orders';
      }
      // FBA is a SIBLING DESK in the Outbound lane, not a tab here, so its
      // paths light nothing on this band rather than falling through to the
      // `orders` catch-all below — a tab claiming to be somewhere you are not
      // is worse than an unlit band. `/shipping/ready` and the legacy
      // `?mode=fba|ready` are FBA's redirect residue and answer the same way.
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
  // ── Scan out (Scan Stations) ──────────────────────────────────────────────
  // Mobile-first composer station: full-bleed center + bottom scan dock.
  // No left recent rail — `railless: true` collapses the context column
  // (operator 2026-08-31 · docs/todo/scan-out-mobile-composer-HANDOFF.md).
  // Shares route key `outbound` for panels on mobile only.
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
  // Packing Review is Operations › Packing Review (desk KPI / queue) — not a
  // Scan Station and not a Shipping L2. Pairing / Catalog link stay on Products
  // via `?mode=` (D10). See operations children above.
  // ── Catalog (Manage Products) ─────────────────────────────────────────────
  // Catalog L1. `?view=manuals|catalog|labels|pairing|qc|kit`; default `manuals`
  // (param cleared). Vocabulary SoT: `@/components/products/products-view`.
  //
  // The former Print Stations rows (`print-labels` / `print-documents`) were
  // deleted here, not moved: every mode they carried was an ALIAS of a URL some
  // canonical row already owned — `?view=labels` is this page, Warehouse labels
  // are the Locations page's own default tab, and receiving stickers are printed
  // at the Unbox bench. Two rows resolving one URL is how `/products?view=labels`
  // ended up with a nav id (`print-labels`) that was not the page it opened.
  //
  // The targets used to null `platform` / `linkFilter` by hand — a two-key
  // denylist that only ever covered the Catalog chrome, which is why `?skuId=`,
  // `?sort=` and `?historyId=` still rode between views. `applyChildTarget` now
  // constructs from PRODUCTS_ROUTE_PARAMS, so a view emits its own delta and
  // there is nothing left to remember to clear.
  {
    id: 'products', label: 'Products', href: PRODUCTS, icon: Tags, kind: 'domain', domainGroup: 'catalog', requires: 'sku_stock.view',
    // Desk page chrome (2026-08-31): the children below are drawn as IN-PAGE
    // tabs by the Products desk, so the spine row stays a flat leaf.
    // NOT `railless` — this desk navigates by its context rail.
    deskChrome: true,
    children: [
      // REMOVED 2026-09-15, operator ruling — *"removing the products
      // reference, the products kit parts, the products listing match … these
      // are all the tabs that are not working properly."*
      //
      // These three are DELETED, not parked (`@/lib/nav/parked-tabs`), and the
      // difference is deliberate: a parked tab keeps its route for a bookmark,
      // while `?view=catalog` and `?view=kit` left the `/products` vocabulary
      // outright (`PRODUCTS_VIEWS`) — a stale link now falls back to Manuals
      // rather than mounting a body nobody maintains. `Listing match` was only
      // ever an ALIAS onto `/review?mode=catalog-link`; that Review surface is
      // untouched and still resolves, it simply no longer has a door here.
      { id: 'manuals', label: 'Manuals', icon: FileText, to: () => ({ pathname: PRODUCTS, params: { view: null } }) },
      { id: 'labels',  label: 'SKU Barcodes',  icon: Barcode,  to: () => ({ pathname: PRODUCTS, params: { view: 'labels' } }) },
      { id: 'pairing', label: 'Pairing', icon: Link2,    to: () => ({ pathname: PRODUCTS, params: { view: 'pairing' } }) },
      { id: 'qc',      label: 'QC Checklist', icon: Check,     to: () => ({ pathname: PRODUCTS, params: { view: 'qc' } }) },
    ],
    resolveChild: ({ pathname, params }) => {
      // Products is still the nav home for the Review station's PAIRING work
      // (D10), so `/review?mode=pairing` lights Pairing here rather than
      // leaving the spine pointing at Fulfillment's packing lane. The
      // `catalog-link` arm went with its tab: no child claims that URL now, so
      // the band lights nothing on it — the honest shape for a surface reached
      // from somewhere else.
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
    // Desk page chrome (2026-08-31): the children below are drawn as IN-PAGE
    // tabs by the Inventory desk, so the spine row stays a flat leaf.
    // `railless` (operator 2026-09-15): the left context rail is gone on every
    // inventory mount. Pickers that used to write `?sku=` / `?bin=` / `?open=`
    // from that rail no longer occupy a column.
    deskChrome: true,
    railless: true,
    children: [
      // `open: null` on every switch so a selection (exception/unit id) from one
      // mode never leaks into another's right pane.
      // Each target used to null `mode`, `section` and `open` by hand — and missed
      // `sku`/`bin`/`unit`/`state`/`condition`/`q`/`field`/`filter`, so a Ledger
      // selection and its filter set rode into Graph. `/inventory` declares
      // INVENTORY_ROUTE_PARAMS, so `applyChildTarget` CONSTRUCTS from the delta and
      // carries only `staff`; the nulls could not affect the result. Verified
      // byte-identical before and after removal for all five modes.
      // Inventory's modes live in the PATH (`/inventory`, `/inventory/triage`, …),
      // so there is no switch param to set — and because the route now declares a
      // spec, `applyChildTarget` CONSTRUCTS and the old `{ mode, section, open }`
      // nulls could not affect the result. An empty delta is the honest form: the
      // path is the mode, `staff` is the only carry.
      //
      // SEVEN OF THESE CHILDREN HAVE NO DOOR. Triage · Pulse · Graph ·
      // Replenish · Reason Codes · Quick Picks · Health are parked in
      // `@/lib/nav/parked-tabs` (operator 2026-09-15 — the tabs that do not
      // work). They stay declared HERE because parking withdraws the door and
      // not the route: each keeps its `to()` and its `resolveChild` clause so
      // a bookmark still lands and the band simply lights nothing. Unpark by
      // deleting the ledger entry, not by editing this list.
      { id: 'ledger',    label: 'Ledger',    icon: Clipboard,  to: () => ({ pathname: INVENTORY, params: {} }) },
      // The warehouse-wide (location, sku) stock list. A SIBLING of Locations,
      // not a member of it: Locations manages the SHELVES (bin tags, bays,
      // rooms, the map) and this reads what is sitting ON them, which is the
      // question the lane's own name asks. Named `Stock` — never `Inventory`,
      // which is the lane, nor `Bins`, which is a Locations tab
      // (`nav-name-collisions.ts`).
      { id: 'stock', label: 'Stock', icon: Package, to: () => ({ pathname: `${INVENTORY}/stock`, params: {} }) },
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
      // Inventory rollout / drift board (ex-`/admin/inventory`). Its Quick
      // links are the door to the operations desks that moved with it
      // (cycle-counts · holds · returns · bulk-allocate · throughput ·
      // events) — those keep no tab of their own, exactly as they kept no
      // admin-console section.
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
  // Legacy Testing family — deep-link / CMD-GO / mode-resolution COMPATIBILITY
  // ONLY. Not in APP_SIDEBAR_NAV. MasterNav lists Quality Control and Ready to
  // Pack as first-class floor rows (`testing` / `ready-to-pack`). Nav stickers
  // still target these children so `isAlreadyAtNavCommand` can tell the two
  // `/test` views apart. Wire id `shipping` stays for URL stability — the face
  // is Ready to Pack, never the outbound Shipping station.
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
  // Data Wipe (`/wipe`) is temporarily absent from master nav — revisit when the
  // station UX is ready for general rollout. Route + `tech.data_wipe` gate remain.
  // Sales history L1 removed — lives on Dashboard L2 (`sales` / `pickup`).
  // `/walk-in` is a redirect shell only (`retiredWalkInHistoryTarget`).
  // ── Support ───────────────────────────────────────────────────────────────
  // `?mode=orders|voicemail|calls|warranty|issues`; bare /support = the Zendesk
  // Tickets console (default, param cleared) for deep-link back-compat.
  // Orders is the To Ship exception Workbench (notes / OOS + ticket hub).
  // Every switch clears mode-scoped params so each mode opens clean — see
  // the /support param spec.
  {
    id: 'support', label: 'Support', href: SUPPORT, icon: AlertCircle, kind: 'domain', domainGroup: 'support', requires: 'integrations.zendesk',
    // Desk page chrome (2026-08-31): Tickets · Voicemail · Calls · Warranty ·
    // Issues are drawn as IN-PAGE tabs. Every one of them stays on `/support`.
    //
    // **To ship was REMOVED here (operator ruling 2026-08-31).** It was the one
    // tab that left the route — an alias onto `/shipping/orders?context=support`
    // with a `resolveChild` claiming that URL so the Shipping desk drew
    // SUPPORT's title and tabs instead of its own. Clever, and a fork: two
    // desks disagreed about whose page you were on, and the To-ship queue has a
    // canonical home in Shipping already. Support does not restate it.
    //
    // Rail-less except Tickets: `isRaillessSurface` keeps the recents dock on
    // the default mode and collapses the column on every other tab.
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
  // ── Automations (map L1) ──────────────────────────────────────────────────
  // Studio is an ordinary map row (2026-08-29). `/studio/catalog` stays a named
  // L2 child for ⌘K, the header Mode switcher, and the URL. Face matches
  // SIDEBAR_TITLES.studio. Href stays /studio (not /automations).
  //
  // Modes are SUB-PATHS, not `?params`, so `to()` names a pathname and sets no
  // delta — `/studio` and `/studio/catalog` are two routes, not two views of one.
  {
    id: 'studio', label: 'Automations', href: '/studio', icon: Workflow,
    kind: 'main', mainGroup: 'studio', requires: 'studio.view', spineFlat: true,
    children: [
      { id: 'graph',   label: 'Studio',  icon: Share2,  to: () => ({ pathname: '/studio' }) },
      { id: 'catalog', label: 'Catalog', icon: Layers,  to: () => ({ pathname: '/studio/catalog' }) },
    ],
    resolveChild: ({ pathname }) =>
      pathname === '/studio/catalog' || pathname.startsWith('/studio/catalog/')
        ? 'catalog'
        : 'graph',
  },
  // Admin is DISSOLVED — `/admin` is a redirect table (`src/app/admin/page.tsx`),
  // not a page with modes. Do not reintroduce an admin entry here.
];

/** Lookup a page's nav entry (children + resolver) by its route/page id. */
export function getSidebarPageNav(pageId: string): SidebarPageNav | undefined {
  return SIDEBAR_PAGE_NAV.find((page) => page.id === pageId);
}

/**
 * Ordered first-class Scan Stations benches — the same flat map MasterNav
 * lists under the Stations disclosure and the header page switcher lists.
 *
 * Pass a pre-filtered page list (e.g. permission-scoped floor pages). When
 * omitted, members are {@link SIDEBAR_PAGE_NAV} ∩ {@link APP_SIDEBAR_NAV} in
 * {@link APP_SIDEBAR_NAV} order so the legacy deep-link `receiving` / `tech`
 * family entries never appear. Packing and Scan out are included — they are
 * floor benches, not a second family.
 */
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
 * Ordered first-class station pages that belong to a subgroup.
 *
 * Pass a pre-filtered page list (e.g. permission-scoped floor pages from the
 * spine). When omitted, members are taken from {@link SIDEBAR_PAGE_NAV} ∩
 * {@link APP_SIDEBAR_NAV} so the legacy deep-link `receiving` family entry is
 * never treated as a display member.
 *
 * Membership is `kind: 'station'` + `stationSubgroup` — so Inbound (`incoming`,
 * `kind: 'domain'`) is naturally excluded from Receiving / Walk-In.
 *
 * The spine and header switcher list {@link floorStationPages} instead — never
 * a nested Receiving / Walk-In / Testing menu. Never read
 * legacy `getSidebarPageNav('receiving').children` for display.
 */
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

/**
 * **THE ONE CHILD FUNNEL.** Drop every child page the operator has no DOOR to:
 * a tab parked in {@link PARKED_TABS}, or one whose `requires` the user lacks.
 *
 * This function is to a TAB what {@link getSidebarNavItems} is to a LANE — the
 * single place both gates live, so a caller cannot re-grant a door by
 * forgetting one. The parked check is unconditional and comes first: it is not
 * a permission, it is a withdrawn door.
 *
 * A child without `requires` is always visible; a gated one needs the
 * permission present.
 *
 * Consumers: the spine (`MasterNav`), the desk tab band
 * (`useDeskPageChromeTabs`), the GlobalHeader page switcher, and the ⌘K
 * palette. Returns the SAME object when nothing is filtered, so callers can
 * memo on the result.
 */
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

/**
 * False when a page DECLARED children and permission filtering removed every
 * one — the page is unreachable, so it must be absent rather than rendered as a
 * dead header that opens onto a denial state.
 *
 * This is the hollow-domain law one level down. It exists because a nav row can
 * carry only ONE `requires`, while a page can genuinely need two gates: Sales is
 * gated on `dashboard.view` (the route) and its feeds on `walk_in.view` (the
 * front desk), so a packer — who holds the first and not the second — would
 * otherwise see a "Sales" row leading nowhere. Widening `requires` to an all-of
 * list would touch the admin access matrix, the role editor, and the landing-page
 * card, none of which have a second permission to express; this predicate is the
 * narrow fix.
 *
 * A genuinely childless page (Operations, Admin, a scan bench) is always
 * reachable — `undefined` children is not the same as "all children filtered".
 */
export function isSidebarPageReachable(page: SidebarPageNav): boolean {
  return page.children === undefined || page.children.length > 0;
}

/**
 * Canonical href for a page id. Modeful pages carry it in `SIDEBAR_PAGE_NAV`;
 * modeless pages (operations, packer, support, ai-chat,
 * audit-log, admin, settings) live only in `APP_SIDEBAR_NAV`. Navigation must
 * resolve through here so EVERY page — not just the modeful ones — lands
 * on its real route. Returns null for an unknown id.
 */
export function getSidebarHref(pageId: string): string | null {
  return (
    getSidebarPageNav(pageId)?.href ??
    APP_SIDEBAR_NAV.find((item) => item.id === pageId)?.href ??
    null
  );
}

/**
 * Apply a mode's `ChildNavTarget` to the current location, returning the next
 * `{ pathname, search }`. `search` has no leading `?`. Pure — does not touch the
 * router. The eventual nav hook decides push-vs-replace around this.
 *
 * **This copy-then-hand-delete is the leak.** It carries the whole namespace to
 * the destination and relies on each surface having remembered to list every key
 * that should not have come along — which is what the four denylists were, and
 * why `?triq=` from Triage arrived on `/unbox`.
 *
 * A destination that has migrated to a route param spec
 * (`@/lib/routing/registry`) ends with a **boundary parse**: it keeps only the
 * params that route declares, so nothing can ride along whether or not anyone
 * remembered it. Un-migrated routes keep the legacy behaviour until their slice.
 */
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

  // Rule 1 — CONSTRUCT, do not copy. Boundary-parsing the copied string is not
  // enough on its own: sibling modes legitimately own keys of the same name
  // (`open`, `sort`, `q` across the four Shipping modes), so a parse cannot tell
  // a stale `?open=` carried from Labels from a real one for Ready. It kept the
  // value and the focused order followed the operator into the next mode.
  //
  // So a mode switch emits the target's OWN delta and nothing else — except the
  // staff filter, which is an operator preference rather than mode state (the
  // same single carry `updateMode` makes in the receiving and outbound hooks).
  const next = new URLSearchParams();
  const staff = params.get('staff') ?? params.get('staffId');
  if (staff) next.set('staff', staff);
  for (const [key, value] of Object.entries(target.params ?? {})) {
    if (value !== null) next.set(key, value);
  }
  return { pathname: target.pathname, search: parseRouteParams(spec, next).toString() };
}

/**
 * True when a page draws its own child pages as in-page tabs
 * ({@link SidebarPageNav.deskChrome}) — the spine must not drill it and the
 * header face must not offer a second switcher for the same destinations.
 *
 * Needs more than one reachable child: with one child (or none, after
 * permission filtering) there is nothing to tab and nothing to suppress.
 */
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
