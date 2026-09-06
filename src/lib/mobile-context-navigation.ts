import type { ReadonlyURLSearchParams } from 'next/navigation';
import {
  APP_SIDEBAR_NAV,
  getSidebarNavPageId,
  type SidebarRouteKey,
} from '@/lib/sidebar-navigation';
import {
  getActiveSettingsSection,
  resolveSettingsSectionFromPath,
  SETTINGS_SECTION_OPTIONS as SETTINGS_REGISTRY,
  type SettingsSection,
} from '@/components/settings/settings-sections';
import {
  getDashboardOrderViewFromSearch,
  normalizeDashboardOrderViewParams,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { PRODUCT_NAME } from '@/lib/branding/constants';

export interface MobileContextOption {
  id: string;
  label: string;
  description?: string;
}

/**
 * Page name for the mobile top bar (right of the hamburger) and tests.
 * `/m/*` labels match the drawer; everything else falls through to the
 * desktop sidebar page label.
 */
export function getMobileAppTitle(
  pathname: string | null,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): string {
  if (!pathname) return PRODUCT_NAME;
  if (pathname === '/m/home' || pathname.startsWith('/m/home/')) return 'Home';
  if (pathname === '/m/work' || pathname.startsWith('/m/work/')) return 'Orders';
  if (pathname === '/m/pick' || pathname.startsWith('/m/pick/')) return 'Picks';
  if (pathname === '/m/pack' || pathname.startsWith('/m/pack/')) return 'Packing';
  if (pathname === '/m/checklist' || pathname.startsWith('/m/checklist/')) return 'Checklists';
  // Before the `/m/scan` case: `/m/scan-out` is a different station, and it
  // matches neither `=== '/m/scan'` nor `startsWith('/m/scan/')`, so without its
  // own line it falls all the way through to PRODUCT_NAME and the top bar reads
  // "Cycle Forge" — brand copy in the most valuable strip on a warehouse phone.
  if (pathname === '/m/scan-out' || pathname.startsWith('/m/scan-out/')) return 'Scan out';
  if (pathname === '/m/scan' || pathname.startsWith('/m/scan/')) return 'Scan';
  if (pathname === '/m/identify' || pathname.startsWith('/m/identify/')) return 'Identify';
  // Workstation pivot (operator 2026-09-06): the surface is the operator's
  // current workstation, not a destination named for one vocabulary. The door
  // is what the armed session is doing, and the session title says that.
  if (pathname === '/m/triage' || pathname.startsWith('/m/triage/')) return 'Workstation';
  if (pathname === '/m/unbox' || pathname.startsWith('/m/unbox/')) return 'Unbox';
  if (pathname === '/m/receive' || pathname.startsWith('/m/receive/')) return 'Unbox';
  if (pathname === '/m/testing' || pathname.startsWith('/m/testing/')) return 'Testing';
  if (pathname === '/m/prepacked' || pathname.startsWith('/m/prepacked/')) return 'Prepacked';
  if (pathname === '/m/companion' || pathname.startsWith('/m/companion/')) return 'Companion';
  if (pathname === '/m/receiving' || pathname.startsWith('/m/receiving/')) {
    const mode = searchParams?.get('mode');
    if (mode === 'local-pickup') return 'Walk-In';
    if (mode === 'repair') return 'Repair';
    return 'Photo feed';
  }
  const pageId = getSidebarNavPageId(pathname, searchParams);
  const nav = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
  return nav?.label || PRODUCT_NAME;
}

export interface MobileContextRowConfig {
  /** Label for the active subsection (row 2 center). */
  activeLabel: string;
  options: MobileContextOption[];
  activeId: string;
  onSelect: (id: string) => void;
}

const DASHBOARD_VIEW_OPTIONS: MobileContextOption[] = [
  { id: 'unshipped', label: 'Pending' },
  { id: 'tested', label: 'Tested' },
  { id: 'packed', label: 'Packed' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'fba', label: 'Amazon Prep' },
];

const RECEIVING_MODE_OPTIONS: MobileContextOption[] = [
  { id: 'triage', label: 'Workstation' },
  { id: 'receive', label: 'Unbox' },
  { id: 'history', label: 'History' },
  { id: 'pickup', label: 'Walk-In' },
];

const WALK_IN_MODE_OPTIONS: MobileContextOption[] = [
  { id: 'repairs', label: 'Repair Service' },
  { id: 'sales', label: 'Sales' },
  { id: 'pickups', label: 'Pickups' },
];

const SETTINGS_SECTION_OPTIONS: MobileContextOption[] = SETTINGS_REGISTRY.map((s) => ({
  id: s.id,
  label: s.label,
}));

const SETTINGS_REQUIRES: Partial<Record<SettingsSection, string>> = {
  team: 'admin.manage_staff',
  roles: 'admin.manage_roles',
  organization: 'admin.view',
  billing: 'admin.view',
  integrations: 'admin.view',
  catalog: 'admin.manage_features',
  sessions: 'admin.view_sessions',
  audit: 'admin.view_logs',
};

export function getMobileContextRowConfig(
  routeKey: SidebarRouteKey,
  searchParams: ReadonlyURLSearchParams,
  navigate: (href: string) => void,
  hasPermission: (perm: string) => boolean,
  isAuthLoaded: boolean,
  isSignedIn: boolean,
  pathname: string | null = null,
): MobileContextRowConfig | null {
  switch (routeKey) {
    case 'dashboard': {
      const activeId = getDashboardOrderViewFromSearch(searchParams);
      const active = DASHBOARD_VIEW_OPTIONS.find((o) => o.id === activeId);
      return {
        activeLabel: active?.label ?? 'Pending',
        activeId,
        options: DASHBOARD_VIEW_OPTIONS,
        onSelect: (id) => {
          const params = new URLSearchParams(searchParams.toString());
          normalizeDashboardOrderViewParams(params, id as DashboardOrderView);
          const qs = params.toString();
          navigate(qs ? `/dashboard?${qs}` : '/dashboard');
        },
      };
    }
    case 'settings': {
      const activeId =
        resolveSettingsSectionFromPath(pathname)
        ?? getActiveSettingsSection(searchParams.get('section'));
      const visible = SETTINGS_SECTION_OPTIONS.filter((opt) => {
        const requires = SETTINGS_REQUIRES[opt.id as SettingsSection];
        if (opt.id === 'security' && (!isAuthLoaded || !isSignedIn)) return false;
        if (!requires) return true;
        if (!isAuthLoaded) return false;
        return hasPermission(requires);
      });
      const active = visible.find((o) => o.id === activeId) ?? visible[0];
      return {
        activeLabel: active?.label ?? 'Settings',
        activeId: active?.id ?? activeId,
        options: visible,
        onSelect: (id) => {
          const def = SETTINGS_REGISTRY.find((s) => s.id === id);
          if (def?.href) {
            navigate(def.href);
            return;
          }
          const params = new URLSearchParams(searchParams.toString());
          params.set('section', id);
          navigate(`/settings?${params.toString()}`);
        },
      };
    }
    case 'receiving': {
      const qsMode = searchParams.get('mode');
      const activeId =
        qsMode === 'pickup'
          ? 'pickup'
          : qsMode === 'history'
            ? 'history'
            : qsMode === 'triage'
              ? 'triage'
              : 'receive';
      const active = RECEIVING_MODE_OPTIONS.find((o) => o.id === activeId);
      return {
        activeLabel: active?.label ?? 'Unbox',
        activeId,
        options: RECEIVING_MODE_OPTIONS,
        onSelect: (id) => {
          const params = new URLSearchParams(searchParams.toString());
          if (id === 'pickup') {
            params.set('mode', 'pickup');
          } else {
            params.set('mode', id);
          }
          navigate(`/receiving?${params.toString()}`);
        },
      };
    }
    case 'walk-in': {
      const category = searchParams.get('category');
      const activeId =
        category === 'sales' || category === 'pickups'
          ? category
          : searchParams.get('mode') === 'sales'
            ? 'sales'
            : 'repairs';
      const active = WALK_IN_MODE_OPTIONS.find((o) => o.id === activeId);
      return {
        activeLabel: active?.label ?? 'Repairs',
        activeId,
        options: WALK_IN_MODE_OPTIONS,
        onSelect: (id) => {
          const params = new URLSearchParams();
          if (id !== 'repairs') params.set('category', id);
          const qs = params.toString();
          navigate(qs ? `/walk-in?${qs}` : '/walk-in');
        },
      };
    }
    default:
      return null;
  }
}

/** Routes that expose a second header row with in-page section switching. */
export function routeHasMobileContextRow(routeKey: SidebarRouteKey): boolean {
  return (
    routeKey === 'dashboard' ||
    routeKey === 'settings' ||
    routeKey === 'receiving' ||
    routeKey === 'walk-in'
  );
}
