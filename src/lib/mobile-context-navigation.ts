import type { ReadonlyURLSearchParams } from 'next/navigation';
import {
  APP_SIDEBAR_NAV,
  getSidebarNavPageId,
  type SidebarRouteKey,
} from '@/lib/sidebar-navigation';
import {
  getActiveSettingsSection,
  resolveSettingsSectionFromPath,
  settingsSectionRoute,
  SETTINGS_SECTION_OPTIONS as SETTINGS_REGISTRY,
  type SettingsSection,
} from '@/components/settings/settings-sections';
import {
  getDashboardOrderViewFromSearch,
  normalizeDashboardOrderViewParams,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { PRODUCT_NAME } from '@/lib/branding/constants';

interface MobileContextOption {
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
  // `/m/home` is the shift checklist since 2026-09-14 — the drawer row and this title are one word, "Daily".
  if (pathname === '/m/home' || pathname.startsWith('/m/home/')) return 'Daily';
  if (pathname === '/m/settings' || pathname.startsWith('/m/settings/')) return 'Settings';
  if (pathname === '/m/work' || pathname.startsWith('/m/work/')) return 'Order management';
  if (pathname === '/m/orders/new' || pathname.startsWith('/m/orders/new/')) return 'New order';
  if (pathname === '/m/orders' || pathname.startsWith('/m/orders/')) return 'Order management';
  if (pathname === '/m/exceptions' || pathname.startsWith('/m/exceptions/')) return 'Exceptions';
  if (pathname === '/m/pick' || pathname.startsWith('/m/pick/')) return 'Picks';
  if (pathname === '/m/pack' || pathname.startsWith('/m/pack/')) return 'Packing';
  if (pathname === '/m/scan' || pathname.startsWith('/m/scan/')) return 'Scan';
  if (pathname === '/m/id/pick' || pathname.startsWith('/m/id/pick/')) return 'Picks';
  if (pathname === '/m/id' || pathname.startsWith('/m/id/')) return 'Scan out';
  const pageId = getSidebarNavPageId(pathname, searchParams);
  const nav = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
  return nav?.label || PRODUCT_NAME;
}

interface MobileContextRowConfig {
  /** Label for the active subsection (row 2 center). */
  activeLabel: string;
  options: MobileContextOption[];
  activeId: string;
  onSelect: (id: string) => void;
}

const DASHBOARD_VIEW_OPTIONS: MobileContextOption[] = [
  { id: 'unshipped', label: 'Pending' },
  { id: 'picked', label: 'Picked' },
  { id: 'packed', label: 'Packed' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'fba', label: 'Amazon Prep' },
];

const RECEIVING_MODE_OPTIONS: MobileContextOption[] = [
  { id: 'triage', label: 'Arrival' },
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
  ai: 'admin.view',
  integrations: 'admin.view',
  catalog: 'admin.manage_features',
  stations: 'sku_stock.manage',
  receiving: 'admin.view',
  sessions: 'admin.view_sessions',
  devices: 'walk_in.enroll_kiosk',
  audit: 'admin.view_logs',
};

function getMobileContextRowConfig(
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
          if (def?.group === 'Personal') {
            navigate(`/settings/me#${def.id}`);
            return;
          }
          navigate(settingsSectionRoute(id as SettingsSection));
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
