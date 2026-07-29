import {
  Activity,
  AlertCircle,
  Archive,
  Barcode,
  BarChart3,
  Boxes,
  Images,
  DoorOpen,
  Check,
  Clipboard,
  ClipboardList,
  Clock,
  FileText,
  History,
  Inbox,
  Layers,
  Layout,
  LayoutDashboard,
  Link2,
  MapPin,
  MessageSquare,
  Monitor,
  Package,
  PackageCheck,
  PackageOpen,
  Printer,
  Search,
  Settings,
  SalesPage,
  SalesPrice,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Tags,
  TrendingUp,
  Send,
  Zap,
  Warehouse,
  ShelvingUnit,
  Phone,
  Voicemail,
} from '@/components/Icons';
import { ADMIN_SECTION_OPTIONS } from '@/components/admin/admin-sections';
import { isParkedSurfaceBlocked, type ParkedSurfaceKey } from '@/lib/dogfood/parked-surfaces';
import {
  PACKING_MODE_ICONS,
  RECEIVING_MODE_ICONS,
  SHIPPING_MODE_ICONS,
  STATION_PAGE_ICONS,
  TECH_MODE_ICONS,
} from '@/lib/nav/station-nav-icons';
import { parseWalkInHistoryMode } from '@/lib/walk-in/history-modes';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';

export type SidebarRouteKey =
  | 'home'
  | 'dashboard'
  | 'order'
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
  | 'admin'
  | 'audit-log'
  | 'manuals-library'
  | 'settings'
  | 'unknown';

export type SidebarIconComponent = (props: { className?: string }) => JSX.Element;

export interface SidebarNavItem {
  id: string;
  label: string;
  href: string;
  icon: SidebarIconComponent;
  /** Optional desktop-only icon override (master nav on lg+). */
  desktopIcon?: SidebarIconComponent;
  kind?: 'main' | 'station' | 'bottom';
  /**
   * Permission required to see this item. If omitted, the item is visible
   * to anyone signed in (and to unauthenticated callers during rollout —
   * see filtering rules in getSidebarNavItems).
   */
  requires?: string;
  /**
   * When set, this row rides a parked dogfood surface: it is filtered out of
   * nav whenever that surface is parked (`isParkedSurfaceBlocked`), so a link
   * to a sub-route of a parked surface never dead-ends on the `ParkedSurface`
   * stand-in. It reappears once the surface is unlocked (`DOGFOOD_FULL_SURFACE`).
   * Use this for a sub-route whose nav id differs from the surface id (which
   * otherwise bypasses the `PARKED_SIDEBAR_NAV_IDS` id filter).
   */
  parkedSurface?: ParkedSurfaceKey;
}

const MOBILE_RESTRICTED_SIDEBAR_IDS = new Set<SidebarRouteKey>([
  'operations',
  'studio',
  'manuals-library',
  'support',
  'admin',
  'audit-log',
  'order',
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
 * Parked off master nav (routes + SIDEBAR_PAGE_NAV modes may still resolve for
 * deep-links / topic worktrees — do not delete those until a surface is
 * promoted back or archived):
 *   home (`/`), operations, sourcing, fba, studio, ai-chat
 * Same pattern as Data Wipe: absent from nav, route can remain live.
 */
export const APP_SIDEBAR_NAV: SidebarNavItem[] = [
  // Home (personal triage + Plan/forge). Parked-aware: shown first only when the
  // Home surface is unlocked (`DOGFOOD_FULL_SURFACE`), hidden for customers — so
  // the locked-prod-nav tests still see it absent (HOME-OPS plan §3.4/§28).
  { id: 'home',              label: 'Home',        href: '/',                   icon: Layout,          kind: 'main',    parkedSurface: 'home' },
  // Operations (Live / Analytics / Insights / History / Signals). Parked-aware —
  // same soft-gate as Home: hidden on prod nav + `ParkedSurface` stand-in until
  // `DOGFOOD_FULL_SURFACE` unlocks the workspace.
  { id: 'operations',        label: 'Operations',  href: '/operations',         icon: Monitor,         kind: 'main',    requires: 'operations.view', parkedSurface: 'operations' },
  { id: 'dashboard',         label: 'Dashboard',   href: '/dashboard',    icon: LayoutDashboard, kind: 'main',    requires: 'dashboard.view' },
  // Front-desk commerce — the overall transaction history (Sales · Pickups ·
  // Repairs categories) plus the sales cart. Renamed from "Walk-In" in the
  // FOH/BOH split: the *work* (Local Pickup, Repair) is now Receiving modes, so
  // this page keeps the commerce/history side and owns the Sales job. `id` stays
  // `walk-in` for bookmark/test stability (id migration is a later pass — see
  // the plan's Overlap register, "Nav id rename").
  { id: 'walk-in',           label: 'Sales',       href: '/walk-in',            icon: SalesPage,       kind: 'main',    requires: 'walk_in.view' },
  { id: 'products',          label: 'Products',    href: '/products',           icon: Tags,            kind: 'main',    requires: 'sku_stock.view' },
  // Inventory workbench — promoted back to dogfood prod nav (was parked).
  { id: 'inventory',         label: 'Inventory',   href: '/inventory',          icon: ShelvingUnit,    kind: 'main',    requires: 'sku_stock.view' },
  // Warehouse map / bins — promoted back to dogfood prod nav (was parked).
  { id: 'warehouse',         label: 'Warehouse',   href: '/warehouse',          icon: Warehouse,       kind: 'main',    requires: 'sku_stock.view' },
  // Points at the Unbox surface (`/unbox`) — the receiving station's default
  // surface — so the primary nav lands on the canonical URL without a redirect
  // hop. Route key still resolves to 'receiving', so the item stays active
  // across every receiving mode (/unbox, /triage, /receiving?mode=…).
  { id: 'receiving',         label: 'Receiving',   href: '/unbox',              icon: STATION_PAGE_ICONS.receiving, kind: 'station', requires: 'receiving.view' },
  { id: 'outbound',          label: 'Shipping',    href: '/shipping',           icon: STATION_PAGE_ICONS.outbound,  kind: 'station', requires: 'shipping.view' },
  // Points at the first-class Test surface (`/test`) so the primary nav lands on
  // the canonical URL without a redirect hop. Route key still resolves to 'tech'
  // (reuses the tech panel), so the item stays active on /test + /tech.
  { id: 'tech',              label: 'Testing',     href: '/test',               icon: STATION_PAGE_ICONS.tech,      kind: 'station', requires: 'tech.view' },
  // Data Wipe / FBA / Sourcing / Studio / AI Chat / Home / Operations are
  // temporarily absent from master nav — dogfood focuses stations + shipping +
  // inventory + warehouse. Routes + mode configs remain for deep-links /
  // preview worktrees.
  { id: 'ops-photos',        label: 'Media library', href: '/ops/photos',       icon: Images,          kind: 'main',    requires: 'photos.view' },
  // Sub-route of the parked `studio` surface — hidden from nav while Studio is
  // parked (so it never dead-ends on the stand-in), shown once it's unlocked.
  { id: 'studio-catalog',    label: 'Catalog',     href: '/studio/catalog',     icon: Layers,          kind: 'main',    requires: 'studio.view', parkedSurface: 'studio' },
  // Points at the first-class Pack surface (`/pack`) so the primary nav lands on
  // the canonical URL without a redirect hop. Route key still resolves to
  // 'packer' (reuses the packer panel), so the item stays active on /pack + /packer.
  { id: 'packer',            label: 'Packing',     href: '/pack',               icon: STATION_PAGE_ICONS.packer,    kind: 'station', requires: 'packing.view' },
  // Packer Review Station — desktop Workbench for approving/flagging packed
  // orders + serial/SKU pairing (WS-REVIEW). Gated on `packing.review` at birth;
  // when tech/receiving/shipping review modes land, widen this to any-of
  // (see SIDEBAR_PAGE_NAV note).
  { id: 'review',            label: 'Review',      href: '/review',             icon: ClipboardList,                kind: 'station', requires: 'packing.review' },
  // Visible with Zendesk tickets *or* warranty (Warranty Logger lives under Support).
  // Support is a floor Station (promoted More → Stations): `/support` mounts
  // SurfaceGate + RouteShell like the other stations. Stays desktop-only
  // (mobile-restricted); no floor-station glyph, so it keeps a plain lucide icon
  // (same precedent as Review, a `kind: 'station'` item with `ClipboardList`).
  { id: 'support',           label: 'Support',     href: '/support',            icon: AlertCircle,     kind: 'station', requires: 'integrations.zendesk' },
  // Audit Log is no longer a top-level sidebar row — it lives under Admin › Logs
  // (AdminLogsTab, with the Audit filter). The /settings/audit and /audit-log/*
  // routes still resolve directly; only the nav row was removed.
  { id: 'admin',             label: 'Admin',       href: '/admin',              icon: ShieldCheck,     kind: 'bottom', requires: 'admin.view' },
  { id: 'settings',          label: 'Settings',    href: '/settings',           icon: Settings,        kind: 'bottom' },
];

/** Parked off prod nav — SoT: `src/lib/dogfood/parked-surfaces.ts` (+ URL soft-gate). */
export { PARKED_SIDEBAR_NAV_IDS } from '@/lib/dogfood/parked-surfaces';

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
}

export function getSidebarNavItems(opts: GetSidebarNavItemsOpts = {}): SidebarNavItem[] {
  const { mobileRestricted = false, permissions } = opts;
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
  // Drop rows that ride a parked surface while that surface is locked, so a
  // sub-route link (whose id bypasses the PARKED_SIDEBAR_NAV_IDS id filter)
  // never points at the ParkedSurface stand-in.
  items = items.filter(
    (item) => !item.parkedSurface || !isParkedSurfaceBlocked(item.parkedSurface),
  );
  return items;
}

/**
 * Route keys that render the **two-card station column** (nav card on top,
 * recents + scan bar card below) instead of the classic single sidebar panel.
 *
 * Exactly the `kind: 'station'` rows of {@link APP_SIDEBAR_NAV} — every bench an
 * operator scans at. Derived by route KEY, not by path prefix, so all of a
 * station's surfaces come along automatically: `receiving` alone covers
 * `/unbox`, `/triage`, `/incoming`, `/pickup`, `/repair` and `/receiving/*`.
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
  'dashboard',
  'order',
  'admin',
  'operations',
  'studio',
  'ai-chat',
  'settings',
  'audit-log',
  'fba',
  'inventory',
  'sourcing',
  'products',
  'warehouse',
  'walk-in',
  'manuals-library',
  // Deliberately NOT here: `ops-photos`. The Media library owns its whole
  // context in the workbench chrome header, so it has no sidebar and reserves no
  // column — the empty-column case this contract exists to express.
]);

/** True when this route's spine holds a context panel — see {@link CONTEXT_PANEL_ROUTE_KEYS}. */
export function hasSidebarContextPanel(pathname: string | null): boolean {
  return CONTEXT_PANEL_ROUTE_KEYS.has(getSidebarRouteKey(pathname));
}

export function getSidebarRouteKey(pathname: string | null): SidebarRouteKey {
  if (!pathname) return 'unknown';
  if (pathname === '/') return 'home';
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return 'dashboard';
  // Dedicated order workspace (`/o/[orderId]`) — full-page workbench with its
  // own Recent/Search sidebar (not the dashboard Orders/Shipping panel).
  if (pathname === '/o' || pathname.startsWith('/o/')) return 'order';
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
  // Local Pickup + Repair are Receiving MODES (not a separate station), so
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
  if (pathname === '/warehouse' || pathname.startsWith('/warehouse/')) return 'warehouse';
  if (pathname === '/sourcing' || pathname.startsWith('/sourcing/')) return 'sourcing';
  if (pathname === '/inventory' || pathname.startsWith('/inventory/')) return 'inventory';
  if (pathname === '/support' || pathname.startsWith('/support/')) return 'support';
  if (pathname === '/ai-chat' || pathname.startsWith('/ai-chat/')) return 'ai-chat';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
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
  if (pathname === '/manuals/library' || pathname.startsWith('/manuals/library/')) return 'manuals-library';
  // /manuals now redirects to /products (see src/app/manuals/page.tsx)
  if (pathname === '/manuals' || pathname.startsWith('/manuals/')) return 'products';
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings';
  return 'unknown';
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

  const hrefSegment = getFirstPathSegment(href);
  const pathnameSegment = getFirstPathSegment(pathname);

  if (hrefSegment === 'test' || hrefSegment === 'pack' || hrefSegment === 'shipping') {
    return pathnameSegment === hrefSegment;
  }

  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

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

/* ════════════════════ MASTER SIDEBAR NAV — page + mode ════════════════════
 *
 * Single source of truth for the "master nav dropdown" (see
 * docs/design-system/master-sidebar-nav-migration-plan.md). Each page that has
 * an L2 mode row declares its modes here, plus the two halves of its URL
 * contract:
 *   • `to()`   — how navigating to a mode mutates the URL (the WRITE path).
 *   • `resolveMode()` — how the active mode is read back from a location (the
 *     READ path). This MIRRORS the panel's own derivation today so deep-links
 *     resolve identically; panels will eventually import this instead of
 *     re-implementing `getReceivingModeFromLocation` / `resolveFbaMode` / etc.
 *
 * P0 (this file) is pure data + pure functions — no components, no router.
 * The round-trip invariant `resolveMode(apply(to(mode))) === mode` is enforced
 * by sidebar-navigation.test.ts so the two halves can never silently diverge.
 */

/** A search-param delta map: value to set, or `null` to delete the key. */
export type SearchParamDelta = Record<string, string | null>;

interface ModeNavTarget {
  /** Absolute pathname to land on (a mode may live on a sub-path, e.g. unfound). */
  pathname: string;
  /** Search-param mutations applied on top of the current params. */
  params?: SearchParamDelta;
}

export interface ModeLocation {
  pathname: string;
  params: Pick<URLSearchParams, 'get' | 'has'>;
}

export interface SidebarModeItem {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  /** Build the nav target for this mode (relative to the page's base href). */
  to: () => ModeNavTarget;
  /** Optional per-mode permission gate (e.g. admin sub-sections). */
  requires?: string;
  /**
   * Optional group heading shown above this mode's row in the dropdown (e.g. the
   * admin sections' People / Data sources / System). Omitted = no header.
   */
  group?: string;
}

export interface SidebarPageNav extends SidebarNavItem {
  /** L2 modes. Omitted for single-surface pages (no mode row). */
  modes?: SidebarModeItem[];
  /**
   * Read the active mode id from a location. Always returns an id present in
   * `modes` (defaulting to the page's leftmost/default mode). Only defined for
   * pages that have `modes`.
   */
  resolveMode?: (loc: ModeLocation) => string;
}

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
const WAREHOUSE = '/warehouse';
const SOURCING = '/sourcing';
const PRODUCTS = '/products';
// Testing graduated to its own first-class surface route (`/test`,
// operator-surfaces refactor Phase 8); its modes navigate there (the `?view=`
// sub-mode rides along). Legacy `/tech` still resolves (proxy redirect + shared
// page). Renamed const so the page href + every mode `to()` land on `/test`.
const TECH = '/test';
const WALK_IN = '/walk-in';
const ADMIN = '/admin';
const SHIPPING = '/shipping';
const SUPPORT = '/support';
/** Cleared on every Support L2 mode switch (mirrors SUPPORT_MODE_SCOPED_PARAMS). */
const SUPPORT_MODE_CLEAR_PARAMS = {
  ticket: null,
  vm: null,
  q: null,
  status: null,
  assignee: null,
  direction: null,
  range: null,
  search: null,
  open: null,
  wstatus: null,
  wexp: null,
  issueId: null,
  type: null,
  reporter: null,
  openOrderId: null,
  ustatus: null,
  attention: null,
  stage: null,
  staff: null,
  view: null,
} as const;
// Packing graduated to its own first-class surface route (`/pack`,
// operator-surfaces refactor Phase 7); its modes navigate there. Legacy
// `/packer` still resolves (proxy redirect + shared page).
const PACK = '/pack';
const REVIEW = '/review';

export const SIDEBAR_PAGE_NAV: SidebarPageNav[] = [
  // ── Dashboard ─────────────────────────────────────────────────────────────
  // Three L2 modes on `?mode=` (SoT `getDashboardModeFromSearch`), left → right:
  //   • Search   (`?mode=search`)  — global search; sidebar shows per-staff recents.
  //   • Receiving(`?mode=inbound`) — inbound cartons; Triage (scanned) / Unbox
  //     (unboxed) table tabs, each with its own KPI + filters. `inbound` is the
  //     param value (kept for surface-isolation + legacy bookmarks); the pill/id
  //     is `receiving`. `?mode=receiving` is accepted as an alias by the resolver.
  //   • Shipping (bare / `?unshipped` / `?shipped`) — outbound orders (default).
  //     Id stays `outbound` so existing deep-links + tests resolve unchanged.
  // The Unshipped/Shipped split is a top-left TAB inside the outbound content
  // (`DashboardOrdersView`). Warranty Logger moved to Support (`?mode=warranty`);
  // legacy `/dashboard?warranty=` redirects there from the dashboard page. Every
  // switch clears the other modes' scoped params so each mode opens clean.
  {
    id: 'dashboard', label: 'Dashboard', href: DASHBOARD, icon: LayoutDashboard, kind: 'main', requires: 'dashboard.view',
    modes: [
      // Every L2 switch clears Search-scoped selection (`openOrderId`/`map`/`q`)
      // so Receiving/Shipping never inherit a Search handoff, and Search opens clean.
      { id: 'search',   label: 'Search',   icon: Search, to: () => ({ pathname: DASHBOARD, params: { mode: 'search', q: null, openOrderId: null, map: null, type: null, unshipped: null, pending: null, shipped: null, fba: null, warranty: null, sort: null, rtab: null, open: null } }) },
      // Lands on the Triage tab (scanned order) — `sort=scanned_newest` keeps the
      // header tab + the table's day-band axis in lockstep (both read `?sort`).
      { id: 'receiving', label: 'Receiving', icon: Inbox, to: () => ({ pathname: DASHBOARD, params: { mode: 'inbound', sort: 'scanned_newest', q: null, openOrderId: null, map: null, type: null, unshipped: null, pending: null, shipped: null, fba: null, warranty: null, dq: null, open: null } }) },
      { id: 'outbound', label: 'Shipping', icon: Send,   to: () => ({ pathname: DASHBOARD, params: { mode: null, q: null, openOrderId: null, map: null, type: null, unshipped: '', pending: null, shipped: null, fba: null, warranty: null, dq: null, rtab: null } }) },
    ],
    resolveMode: ({ params }) => {
      const m = String(params.get('mode') || '').trim().toLowerCase();
      if (m === 'search') return 'search';
      if (m === 'inbound' || m === 'receiving') return 'receiving';
      // `?unshipped`, `?shipped`, legacy `?pending`, or nothing → Shipping.
      return 'outbound';
    },
  },
  // ── Operations ────────────────────────────────────────────────────────────
  // `?mode=analytics|insights|history|signals`; bare /operations = the Live
  // floor dashboard (default). The L2 rail mirrors the five right-pane modes
  // (OperationsWorkspace) — SoT `OPERATIONS_MODE_ITEMS`. `plans` is no longer an
  // Operations mode (forge/plans moved to Home, HOME-OPS §3.2) — `?mode=plans`
  // bookmarks still redirect to Home via OperationsWorkspace. Every switch clears
  // the mode-scoped params (search, selection, range, section…) so each mode
  // opens clean — matches Inventory.
  {
    id: 'operations', label: 'Operations', href: OPERATIONS, icon: Monitor, kind: 'main', requires: 'operations.view',
    modes: [
      { id: 'live',      label: 'Live',      icon: Activity,  to: () => ({ pathname: OPERATIONS, params: { mode: null, signalsView: null, signalId: null, window: null, signalKind: null, q: null, open: null, section: null, range: null, segment: null, staffId: null, station: null } }) },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, to: () => ({ pathname: OPERATIONS, params: { mode: 'analytics', signalsView: null, signalId: null, window: null, signalKind: null, q: null, open: null, section: null, range: null, segment: null, staffId: null, station: null } }) },
      { id: 'insights',  label: 'Insights',  icon: Sparkles,  to: () => ({ pathname: OPERATIONS, params: { mode: 'insights',  signalsView: null, signalId: null, window: null, signalKind: null, q: null, open: null, section: null, range: null, segment: null, staffId: null, station: null } }) },
      { id: 'history',   label: 'History',   icon: History,   to: () => ({ pathname: OPERATIONS, params: { mode: 'history',   signalsView: null, signalId: null, window: null, signalKind: null, q: null, open: null, section: null, range: null, segment: null, staffId: null, station: null } }) },
      { id: 'signals',   label: 'Signals',   icon: Zap,       to: () => ({ pathname: OPERATIONS, params: { mode: 'signals',   signalsView: null, signalId: null, window: null, signalKind: null, q: null, open: null, section: null, range: null, segment: null, staffId: null, station: null } }) },
    ],
    resolveMode: ({ params }) => {
      const m = params.get('mode');
      if (m === 'analytics') return 'analytics';
      if (m === 'insights') return 'insights';
      if (m === 'history') return 'history';
      if (m === 'signals') return 'signals';
      return 'live';
    },
  },
  // ── Receiving ─────────────────────────────────────────────────────────────
  // `?mode=incoming|triage|history|pickup`; bare /receiving = the Unbox
  // workspace (id `receive`) — kept as the default for deep-link + realtime
  // back-compat. `triage` (label "Arrival") is the dock scan/identify surface that
  // runs before unboxing; it's the 2nd pill and reachable at ?mode=triage. The
  // former `unfound` mode was relocated to Admin › PO Mailbox.
  {
    // href is the Unbox surface (the receiving station's default); keep it in
    // sync with APP_SIDEBAR_NAV so `getSidebarHref('receiving')` resolves there.
    id: 'receiving', label: 'Receiving', href: UNBOX, icon: STATION_PAGE_ICONS.receiving, kind: 'station', requires: 'receiving.view',
    modes: [
      // Incoming now lives at its own route (`/incoming`).
      { id: 'incoming', label: 'Incoming',     icon: RECEIVING_MODE_ICONS.incoming, to: () => ({ pathname: INCOMING, params: { mode: null } }) },
      // Triage now lives at its own route (`/triage`); dropping `mode` avoids a
      // stale `?mode=` riding onto the surface path.
      { id: 'triage',   label: 'Arrival',    icon: RECEIVING_MODE_ICONS.triage,   to: () => ({ pathname: TRIAGE, params: { mode: null } }) },
      // Unbox now lives at its own route (`/unbox`); dropping `mode` avoids a
      // stale `?mode=` riding onto the surface path.
      { id: 'receive',  label: 'Unbox',        icon: RECEIVING_MODE_ICONS.receive,  to: () => ({ pathname: UNBOX, params: { mode: null } }) },
      // Front-desk receiving work — two sibling modes, each on its own route.
      // (They were briefly one "Walk-In" station with a `?job=` switcher; that
      // model is gone — the jobs ARE modes. Sales lives on the Sales page.)
      { id: 'pickup',   label: 'Local Pickup', icon: RECEIVING_MODE_ICONS.pickup,   to: () => ({ pathname: PICKUP, params: { mode: null, job: null } }) },
      { id: 'repair',   label: 'Repair',       icon: RECEIVING_MODE_ICONS.repair,   to: () => ({ pathname: REPAIR, params: { mode: null, job: null } }) },
      // History is NOT a receiving mode — it graduated to a `/dashboard` mode
      // (plan lane 04). `/receiving/history` still resolves until that lands.
    ],
    resolveMode: ({ pathname, params }) => {
      // The graduated surface routes resolve path-based (consistent with
      // Inventory's graph/triage/pulse), regardless of params.
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
  // ── Sourcing ──────────────────────────────────────────────────────────────
  // `?mode=scout|watchlist`; bare /sourcing = the Queue (demand) surface (default).
  // Legacy keys aliased: `alerts`→queue, `lookup`→scout.
  {
    id: 'sourcing', label: 'Sourcing', href: SOURCING, icon: Search, kind: 'main', requires: 'sourcing.view',
    modes: [
      { id: 'queue',     label: 'Queue',     icon: AlertCircle, to: () => ({ pathname: SOURCING, params: { mode: null, q: null, status: null } }) },
      { id: 'scout',     label: 'Scout',     icon: Search,      to: () => ({ pathname: SOURCING, params: { mode: 'scout', q: null, status: null } }) },
      { id: 'watchlist', label: 'Watchlist', icon: Star,        to: () => ({ pathname: SOURCING, params: { mode: 'watchlist', q: null, status: null } }) },
      { id: 'searches',  label: 'Searches',  icon: Clock,       to: () => ({ pathname: SOURCING, params: { mode: 'searches', q: null, status: null } }) },
      { id: 'suppliers', label: 'Suppliers', icon: Link2,       to: () => ({ pathname: SOURCING, params: { mode: 'suppliers', q: null, status: null } }) },
    ],
    resolveMode: ({ params }) => {
      const m = params.get('mode');
      if (m === 'scout' || m === 'lookup') return 'scout';
      if (m === 'watchlist') return 'watchlist';
      if (m === 'searches') return 'searches';
      if (m === 'suppliers') return 'suppliers';
      return 'queue';
    },
  },
  // ── FBA prep (legacy page nav — surface split hosts under Shipping) ─────
  // Deep-links still resolve; primary UX is `/shipping?mode=fba&fbaMode=…`.
  {
    id: 'fba', label: 'FBA prep', href: SHIPPING, icon: Boxes, kind: 'main', requires: 'fba.view',
    modes: [
      { id: 'plan',    label: 'Plan',    icon: ClipboardList, to: () => ({ pathname: SHIPPING, params: { mode: 'fba', fbaMode: 'plan' } }) },
      { id: 'combine', label: 'Combine', icon: Package,       to: () => ({ pathname: SHIPPING, params: { mode: 'fba', fbaMode: null } }) },
      { id: 'shipped', label: 'Shipped', icon: PackageCheck,  to: () => ({ pathname: SHIPPING, params: { mode: 'fba', fbaMode: 'shipped' } }) },
    ],
    resolveMode: ({ params }) => {
      const v = String(params.get('fbaMode') || params.get('mode') || '').trim().toLowerCase();
      return v === 'plan' || v === 'shipped' ? v : 'combine';
    },
  },
  // ── Shipping station ──────────────────────────────────────────────────────
  // `?mode=labels|scan-out|ready|fba`; default `labels` (param cleared).
  // Nav id stays `outbound` for bookmark/test stability (route is `/shipping`).
  {
    id: 'outbound', label: 'Shipping', href: SHIPPING, icon: STATION_PAGE_ICONS.outbound, kind: 'station', requires: 'shipping.view',
    // Scan out sits last (rightmost) — the dock ship-confirm station is the
    // end-of-line action after labels/ready/fba prep.
    modes: [
      { id: 'labels',   label: 'Labels',   icon: SHIPPING_MODE_ICONS.labels,   to: () => ({ pathname: SHIPPING, params: { mode: null, q: null, open: null, sort: null, fbaMode: null } }) },
      { id: 'ready',    label: 'Ready',    icon: SHIPPING_MODE_ICONS.ready,    to: () => ({ pathname: SHIPPING, params: { mode: 'ready', q: null, open: null, sort: null, fbaMode: null } }) },
      { id: 'fba',      label: 'FBA',      icon: SHIPPING_MODE_ICONS.fba,      to: () => ({ pathname: SHIPPING, params: { mode: 'fba', q: null, open: null, sort: null } }) },
      { id: 'scan-out', label: 'Scan out', icon: SHIPPING_MODE_ICONS['scan-out'], to: () => ({ pathname: SHIPPING, params: { mode: 'scan-out', q: null, open: null, sort: null, fbaMode: null } }) },
    ],
    resolveMode: ({ params }) => {
      const m = params.get('mode');
      if (m === 'scan-out' || m === 'ready' || m === 'fba') return m;
      return 'labels';
    },
  },
  // ── Packing ───────────────────────────────────────────────────────────────
  // `?packMode=fragile|multi`; default `standard` (param cleared). Mirrors the
  // panel's own `?packMode=` derivation so deep-links resolve identically.
  {
    id: 'packer', label: 'Packing', href: PACK, icon: STATION_PAGE_ICONS.packer, kind: 'station', requires: 'packing.view',
    modes: [
      { id: 'standard', label: 'Standard',   icon: PACKING_MODE_ICONS.standard, to: () => ({ pathname: PACK, params: { packMode: null } }) },
      { id: 'fragile',  label: 'Fragile',    icon: PACKING_MODE_ICONS.fragile,  to: () => ({ pathname: PACK, params: { packMode: 'fragile' } }) },
      { id: 'multi',    label: 'Multi-Item', icon: PACKING_MODE_ICONS.multi,    to: () => ({ pathname: PACK, params: { packMode: 'multi' } }) },
    ],
    resolveMode: ({ params }) => {
      const m = params.get('packMode');
      return m === 'fragile' || m === 'multi' ? m : 'standard';
    },
  },
  // ── Review (Packer Review Station) ─────────────────────────────────────────
  // The `?mode=` axis = WHICH station's work you're reviewing. Packing (photo/
  // item decide) is the default (param cleared); Pairing allocates serial/SKU to
  // outbound lines; Catalog link pairs unmatched import listings to Zoho/catalog.
  // Tech / receiving / shipping review land later as pills on the SAME page —
  // never new routes. When a non-packing review mode ships, widen the
  // APP_SIDEBAR_NAV `requires` gate to any-of (packing.review OR …).
  {
    id: 'review', label: 'Review', href: REVIEW, icon: ClipboardList, kind: 'station', requires: 'packing.review',
    modes: [
      { id: 'packer', label: 'Packing', icon: PackageCheck, to: () => ({ pathname: REVIEW, params: { mode: null, rtab: null, packerLogId: null, orderId: null, choreId: null } }) },
      { id: 'pairing', label: 'Pairing', icon: Link2, to: () => ({ pathname: REVIEW, params: { mode: 'pairing', rtab: null, packerLogId: null, orderId: null, choreId: null } }) },
      { id: 'catalog-link', label: 'Catalog link', icon: Tags, to: () => ({ pathname: REVIEW, params: { mode: 'catalog-link', rtab: null, packerLogId: null, orderId: null, choreId: null } }) },
    ],
    resolveMode: ({ params }) => {
      const m = params.get('mode');
      if (m === 'pairing' || m === 'catalog-link') return m;
      return 'packer';
    },
  },
  // ── Inventory ─────────────────────────────────────────────────────────────
  // `?mode=triage|pulse` or `?section=replenish`; default `ledger`.
  {
    id: 'inventory', label: 'Inventory', href: INVENTORY, icon: ShelvingUnit, kind: 'main', requires: 'sku_stock.view',
    modes: [
      // `open: null` on every switch so a selection (exception/unit id) from one
      // mode never leaks into another's right pane.
      { id: 'ledger',    label: 'Ledger',    icon: Clipboard,  to: () => ({ pathname: INVENTORY, params: { mode: null, section: null, open: null } }) },
      { id: 'triage',    label: 'Triage',    icon: Zap,        to: () => ({ pathname: `${INVENTORY}/triage`, params: { mode: null, section: null, open: null } }) },
      { id: 'pulse',     label: 'Pulse',     icon: TrendingUp, to: () => ({ pathname: `${INVENTORY}/pulse`, params: { mode: null, section: null, open: null } }) },
      { id: 'graph',     label: 'Graph',     icon: Layers,     to: () => ({ pathname: `${INVENTORY}/graph`, params: { mode: null, section: null, open: null } }) },
      { id: 'replenish', label: 'Replenish', icon: History,    to: () => ({ pathname: INVENTORY, params: { section: 'replenish', mode: null, open: null } }) },
    ],
    resolveMode: ({ pathname, params }) => {
      // Path-based modes (consistent with graph). Legacy `?mode=` still resolves.
      if (pathname.startsWith(`${INVENTORY}/graph`)) return 'graph';
      if (pathname.startsWith(`${INVENTORY}/triage`)) return 'triage';
      if (pathname.startsWith(`${INVENTORY}/pulse`)) return 'pulse';
      if (params.get('section') === 'replenish') return 'replenish';
      const m = params.get('mode');
      if (m === 'triage') return 'triage';
      if (m === 'pulse') return 'pulse';
      return 'ledger';
    },
  },
  // ── Warehouse ─────────────────────────────────────────────────────────────
  // `?tab=labels|racks|rooms|bins|map`; default `labels` (param cleared).
  {
    id: 'warehouse', label: 'Warehouse', href: WAREHOUSE, icon: Warehouse, kind: 'main', requires: 'sku_stock.view',
    modes: [
      { id: 'labels', label: 'Labels', icon: Printer,  to: () => ({ pathname: WAREHOUSE, params: { tab: null } }) },
      { id: 'racks',  label: 'Racks',  icon: Layers,   to: () => ({ pathname: WAREHOUSE, params: { tab: 'racks' } }) },
      { id: 'rooms',  label: 'Rooms',  icon: DoorOpen, to: () => ({ pathname: WAREHOUSE, params: { tab: 'rooms' } }) },
      { id: 'bins',   label: 'Bins',   icon: Archive,  to: () => ({ pathname: WAREHOUSE, params: { tab: 'bins' } }) },
      { id: 'map',    label: 'Map',    icon: MapPin,   to: () => ({ pathname: WAREHOUSE, params: { tab: 'map' } }) },
    ],
    resolveMode: ({ params }) => {
      const t = params.get('tab');
      return t === 'rooms' || t === 'bins' || t === 'racks' || t === 'map' ? t : 'labels';
    },
  },
  // ── Products ──────────────────────────────────────────────────────────────
  // `?view=manuals|catalog|labels|pairing|qc|kit`; default `manuals` (param cleared).
  {
    id: 'products', label: 'Products', href: PRODUCTS, icon: Tags, kind: 'main', requires: 'sku_stock.view',
    modes: [
      { id: 'catalog', label: 'Catalog', icon: Tags, to: () => ({ pathname: PRODUCTS, params: { view: 'catalog', platform: null, linkFilter: null } }) },
      { id: 'manuals', label: 'Manuals', icon: FileText, to: () => ({ pathname: PRODUCTS, params: { view: null, platform: null, linkFilter: null } }) },
      { id: 'labels',  label: 'Labels',  icon: Barcode,  to: () => ({ pathname: PRODUCTS, params: { view: 'labels', platform: null, linkFilter: null } }) },
      { id: 'pairing', label: 'Pairing', icon: Link2,    to: () => ({ pathname: PRODUCTS, params: { view: 'pairing', platform: null, linkFilter: null } }) },
      { id: 'qc',      label: 'QC',      icon: Check,     to: () => ({ pathname: PRODUCTS, params: { view: 'qc', platform: null, linkFilter: null } }) },
      { id: 'kit',     label: 'Kit Parts', icon: PackageOpen, to: () => ({ pathname: PRODUCTS, params: { view: 'kit', platform: null, linkFilter: null } }) },
    ],
    resolveMode: ({ params }) => {
      const v = params.get('view');
      return v === 'catalog' || v === 'labels' || v === 'pairing' || v === 'qc' || v === 'kit' ? v : 'manuals';
    },
  },
  // ── Testing ───────────────────────────────────────────────────────────────
  // Top-mode switch — Testing / Shipping (matches TECH_TOP_MODE_ITEMS).
  // `?view=testing` → Testing (history browse when no line; panel when open);
  // everything else is Shipping (right pane = Pending · FBA | History workspace).
  // Legacy `?view=testing-history` redirects to `?view=testing`.
  {
    id: 'tech', label: 'Testing', href: TECH, icon: STATION_PAGE_ICONS.tech, kind: 'station', requires: 'tech.view',
    modes: [
      { id: 'testing',  label: 'Testing',  icon: TECH_MODE_ICONS.testing,  to: () => ({ pathname: TECH, params: { view: 'testing' } }) },
      { id: 'shipping', label: 'Shipping', icon: TECH_MODE_ICONS.shipping, to: () => ({ pathname: TECH, params: { view: null } }) },
    ],
    resolveMode: ({ params }) =>
      params.get('view') === 'testing' || params.get('view') === 'testing-history'
        ? 'testing'
        : 'shipping',
  },
  // Data Wipe (`/wipe`) is temporarily absent from master nav — revisit when the
  // station UX is ready for general rollout. Route + `tech.data_wipe` gate remain.
  // ── Sales (front-desk transaction-history hub) ────────────────────────────
  // Formerly "Walk-In". Intake/processing lives on `/pickup` (Local Pickup) and
  // `/repair` (Receiving Repair queue). This page is the observe side — Local
  // Pickup · Sales history. `?mode=pickup|sales` (default `sales` dropped);
  // legacy `?mode=repair` / `?category=repairs` redirect to `/repair` at the
  // proxy. `?new=true` / `?openRepair=` still redirect via `useWalkInTaskRedirect`.
  {
    id: 'walk-in', label: 'Sales', href: WALK_IN, icon: SalesPage, kind: 'main', requires: 'walk_in.view',
    modes: [
      { id: 'pickup', label: 'Local Pickup', icon: ShoppingCart, to: () => ({ pathname: WALK_IN, params: { mode: 'pickup', tab: null, category: null } }) },
      { id: 'sales',  label: 'Sales',        icon: SalesPrice,   to: () => ({ pathname: WALK_IN, params: { mode: null, tab: null, category: null } }) },
    ],
    // Reads the new `?mode=`, falling back to legacy `?category=` for old links.
    resolveMode: ({ params }) => parseWalkInHistoryMode(params.get('mode') ?? params.get('category')),
  },
  // ── Support ───────────────────────────────────────────────────────────────
  // `?mode=orders|voicemail|calls|warranty|issues`; bare /support = the Zendesk
  // Tickets console (default, param cleared) for deep-link back-compat.
  // Orders is the To Ship exception Workbench (notes / OOS + ticket hub).
  // Every switch clears mode-scoped params so each mode opens clean — see
  // SUPPORT_MODE_SCOPED_PARAMS.
  {
    id: 'support', label: 'Support', href: SUPPORT, icon: AlertCircle, kind: 'station', requires: 'integrations.zendesk',
    modes: [
      {
        id: 'tickets',
        label: 'Tickets',
        icon: Inbox,
        to: () => ({
          pathname: SUPPORT,
          params: { ...SUPPORT_MODE_CLEAR_PARAMS, mode: null },
        }),
      },
      {
        id: 'orders',
        label: 'Orders',
        icon: Package,
        requires: 'orders.view',
        to: () => ({
          pathname: SUPPORT,
          params: { ...SUPPORT_MODE_CLEAR_PARAMS, mode: 'orders' },
        }),
      },
      {
        id: 'voicemail',
        label: 'Voicemail',
        icon: Voicemail,
        to: () => ({
          pathname: SUPPORT,
          params: { ...SUPPORT_MODE_CLEAR_PARAMS, mode: 'voicemail' },
        }),
      },
      {
        id: 'calls',
        label: 'Calls',
        icon: Phone,
        to: () => ({
          pathname: SUPPORT,
          params: { ...SUPPORT_MODE_CLEAR_PARAMS, mode: 'calls' },
        }),
      },
      {
        id: 'warranty',
        label: 'Warranty',
        icon: ShieldCheck,
        requires: 'warranty.view',
        to: () => ({
          pathname: SUPPORT,
          params: { ...SUPPORT_MODE_CLEAR_PARAMS, mode: 'warranty' },
        }),
      },
      {
        id: 'issues',
        label: 'Issues',
        icon: MessageSquare,
        requires: 'support.issues.view',
        to: () => ({
          pathname: SUPPORT,
          params: { ...SUPPORT_MODE_CLEAR_PARAMS, mode: 'issues' },
        }),
      },
    ],
    resolveMode: ({ params }) => {
      const m = params.get('mode');
      if (m === 'orders') return 'orders';
      if (m === 'voicemail') return 'voicemail';
      if (m === 'calls') return 'calls';
      if (m === 'warranty') return 'warranty';
      if (m === 'issues') return 'issues';
      return 'tickets';
    },
  },
  // ── Admin (grouped section rows — hover modes dropdown + full nav) ─────────
  // 20+ sections derived from ADMIN_SECTION_OPTIONS (single source of truth), so
  // every section is ≤2 taps from the header dropdown and the closed header shows
  // the active section name. The AdminSidebar body keeps its own grouped/described
  // list (not gated). Hovering the header trigger lists every section (grouped,
  // scrollable); clicking opens the full nav. `?section=<value>`;
  // `overview` clears the param so deep-links land cleanly on overview.
  {
    id: 'admin', label: 'Admin', href: ADMIN, icon: ShieldCheck, kind: 'bottom', requires: 'admin.view',
    modes: ADMIN_SECTION_OPTIONS.map((section) => ({
      id: section.value,
      label: section.label,
      icon: section.icon as SidebarIconComponent,
      group: section.group,
      requires: section.requires,
      to: () => ({ pathname: ADMIN, params: { section: section.value === 'overview' ? null : section.value } }),
    })),
    resolveMode: ({ params }) => {
      const v = params.get('section');
      return v && ADMIN_SECTION_OPTIONS.some((section) => section.value === v) ? v : 'overview';
    },
  },
];

/** Lookup a page's nav entry (modes + resolver) by its route/page id. */
export function getSidebarPageNav(pageId: string): SidebarPageNav | undefined {
  return SIDEBAR_PAGE_NAV.find((page) => page.id === pageId);
}

/**
 * Drop modes the user can't access (per-mode `requires`, e.g. admin sub-sections)
 * so every mode surface matches the page body's own permission filtering. Modes
 * without `requires` are always visible; gated modes need the permission present.
 *
 * Consumers: the master-nav dropdown (`MasterNav`) and the ⌘K palette's Modes
 * group (`CommandBar`). Returns the SAME object when nothing is filtered, so
 * callers can memo on the result.
 */
export function filterPageModes(
  page: SidebarPageNav,
  permissions?: ReadonlySet<string>,
): SidebarPageNav {
  if (!page.modes) return page;
  const modes = page.modes.filter(
    (mode) => !mode.requires || (permissions?.has(mode.requires) ?? false),
  );
  return modes.length === page.modes.length ? page : { ...page, modes };
}

/**
 * Canonical href for a page id. Modeful pages carry it in `SIDEBAR_PAGE_NAV`;
 * modeless pages (operations, packer, support, ai-chat,
 * audit-log, admin, settings) live only in `APP_SIDEBAR_NAV`. Navigation must
 * resolve through here so EVERY page — not just the eight modeful ones — lands
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
 * Apply a mode's `ModeNavTarget` to the current location, returning the next
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
export function applyModeTarget(
  current: { pathname: string; params: Pick<URLSearchParams, 'toString'> },
  target: ModeNavTarget,
): { pathname: string; search: string } {
  const params = new URLSearchParams(current.params.toString());
  for (const [key, value] of Object.entries(target.params ?? {})) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const spec = routeParamsFor(target.pathname);
  const next = spec ? parseRouteParams(spec, params) : params;
  return { pathname: target.pathname, search: next.toString() };
}

/**
 * Read the active mode id for a page from a location. Returns `null` for
 * single-surface pages (no modes). Mirrors each panel's own derivation.
 */
export function resolveSidebarMode(pageId: string, loc: ModeLocation): string | null {
  const page = getSidebarPageNav(pageId);
  if (!page?.resolveMode) return null;
  return page.resolveMode(loc);
}
