import {
  APP_SIDEBAR_NAV,
  getSidebarNavPageId,
} from '@/lib/sidebar-navigation';
import { PRODUCT_NAME } from '@/lib/branding/constants';

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
  if (pathname === '/m/customers' || pathname.startsWith('/m/customers/')) return 'Customers';
  if (pathname === '/m/qc' || pathname.startsWith('/m/qc/')) return 'Quality control';
  if (pathname === '/m/work') return 'Allocate';
  if (pathname.startsWith('/m/work/')) return 'Fulfill';
  if (pathname === '/m/orders/new' || pathname.startsWith('/m/orders/new/')) return 'New order';
  if (pathname === '/m/orders') return 'Allocate';
  if (pathname.startsWith('/m/orders/')) return 'Fulfill';
  if (pathname === '/m/exceptions' || pathname.startsWith('/m/exceptions/')) return 'Exceptions';
  if (pathname === '/m/support') return 'Support';
  if (pathname === '/m/imports' || pathname.startsWith('/m/imports/')) return 'Imports';
  if (pathname === '/m/stock' || pathname.startsWith('/m/stock/')) return 'Stock';
  if (pathname === '/m/racks') return 'Racks';
  if (pathname === '/m/products' || pathname.startsWith('/m/products/')) return 'Products';
  if (pathname === '/m/reports' || pathname.startsWith('/m/reports/')) return 'Reports';
  if (pathname === '/m/activity' || pathname.startsWith('/m/activity/')) return 'Live activity';
  if (pathname === '/m/live-feed') return 'Live feed';
  if (pathname === '/m/pick' || pathname.startsWith('/m/pick/')) return 'Picks';
  if (pathname === '/m/pack' || pathname.startsWith('/m/pack/')) return 'Packing';
  if (pathname === '/m/scan' || pathname.startsWith('/m/scan/')) return 'Scan';
  if (pathname === '/m/id/pick' || pathname.startsWith('/m/id/pick/')) return 'Picks';
  if (pathname === '/m/id' || pathname.startsWith('/m/id/')) return 'Scan out';
  // The Unbox photo feed and its `View all` search; the drawer row is "Photo feed".
  if (pathname === '/m/receiving' || pathname === '/m/receiving/history') return 'Photo feed';
  // The unbox-next queue (most urgent shelf first); door on the photo feed strip.
  if (pathname === '/m/unbox') return 'Unbox next';
  const pageId = getSidebarNavPageId(pathname, searchParams);
  const nav = APP_SIDEBAR_NAV.find((item) => item.id === pageId);
  return nav?.label || PRODUCT_NAME;
}
