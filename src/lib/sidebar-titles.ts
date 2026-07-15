import { getSidebarRouteKey } from '@/lib/sidebar-navigation';

/**
 * Human-readable sidebar titles keyed by the canonical route key
 * (see {@link getSidebarRouteKey}). Pure data — no React.
 */
export const SIDEBAR_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  order: 'Order lookup',
  search: 'Search',
  operations: 'Operations',
  'ops-photos': 'Media library',
  studio: 'Operations Studio',
  fba: 'FBA prep',
  receiving: 'Receiving',
  repair: 'Repair',
  'walk-in': 'Walk-In',
  'work-orders': 'Work Orders',
  replenish: 'Replenish',
  inventory: 'Inventory',
  products: 'Products',
  warehouse: 'Warehouse',
  sourcing: 'Sourcing',
  tech: 'Testing',
  packer: 'Packing',
  outbound: 'Shipping',
  support: 'Support',
  'ai-chat': 'AI Chat',
  admin: 'Admin',
  'audit-log': 'Audit Log',
  settings: 'Settings',
};

/**
 * Resolve the sidebar title for a pathname, falling back to `'Home'`.
 *
 * @param pathname Current `usePathname()` value (may be `null`).
 */
export function getSidebarTitle(pathname: string | null): string {
  return SIDEBAR_TITLES[getSidebarRouteKey(pathname)] ?? 'Home';
}
