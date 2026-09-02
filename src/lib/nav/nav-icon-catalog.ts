/**
 * Bounded glyph set an org may assign to nav / desk-tab faces.
 *
 * Override JSON stores a string key from this map. Unknown keys are ignored
 * (same additive rule as {@link mergeOrgNav}: data cannot invent a glyph the
 * product does not ship). No uploads, no per-tab colour.
 */

import type { SidebarIconComponent } from '@/lib/sidebar-navigation';
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  ClipboardList,
  Home,
  Images,
  Inbox,
  LayoutDashboard,
  Package,
  PackageCheck,
  PackageOpen,
  ScanBarcode,
  Search,
  Settings,
  ShieldCheck,
  Workflow,
} from '@/components/Icons';

export const NAV_ICON_CATALOG = {
  LayoutDashboard,
  AlertCircle,
  AlertTriangle,
  PackageCheck,
  Package,
  PackageOpen,
  Boxes,
  ClipboardList,
  ScanBarcode,
  Inbox,
  Home,
  Images,
  Search,
  Settings,
  ShieldCheck,
  Workflow,
} as const satisfies Record<string, SidebarIconComponent>;

export type NavIconKey = keyof typeof NAV_ICON_CATALOG;

export const NAV_ICON_KEYS = Object.keys(NAV_ICON_CATALOG) as NavIconKey[];

export function isNavIconKey(value: unknown): value is NavIconKey {
  return typeof value === 'string' && value in NAV_ICON_CATALOG;
}

export function resolveNavIcon(key: string | undefined | null): SidebarIconComponent | null {
  if (!isNavIconKey(key)) return null;
  return NAV_ICON_CATALOG[key];
}
