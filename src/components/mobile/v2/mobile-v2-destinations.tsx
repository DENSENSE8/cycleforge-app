import type { ComponentType } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Package,
  PackageCheck,
  Printer,
  ScanBarcode,
  Settings,
  Radar,
  Tag,
  TicketHelp,
  Trash2,
  User,
  Warehouse,
} from '@/components/Icons';
import {
  DOMAIN_GROUPS,
  type DomainGroupId,
} from '@/lib/nav/lanes';
import { SHIPPING_NAV_ICONS, STATION_PAGE_ICONS, TECH_NAV_ICONS } from '@/lib/nav/station-nav-icons';
import { CUSTOMER_PATHS, FULFILLED_PATHS, PREPACK_PATHS, QUALITY_CONTROL_PATHS, SUPPORT_PATHS, WAREHOUSE_PATHS } from '@/lib/nav/route-tree';
import { FBM_DESTINATIONS } from '@/lib/nav/fbm-destinations';
import { spineParentTone } from '@/lib/nav/spine-parent-tone';
import {
  SPINE_NAVIGATION_BAND_ORDER,
  spineNavigationBandTitle,
  type SpineNavigationBand,
} from '@/lib/nav/spine-navigation-band';
import { OUTBOUND_MODE_PATHS } from '@/lib/outbound/route-contract';
import { LIVE_FEED_MOBILE_PATH } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSION } from '@/lib/live-feed/stages';

type DestinationIcon = ComponentType<{ className?: string }>;

export interface MobileV2Destination {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: DestinationIcon;
  /** Same semantic ink as the corresponding desktop sidebar destination. */
  tone: string;
  requires?: string;
  /** Contract marker; omitted from mobile navigation until a native surface exists. */
  ported?: boolean;
}

export interface MobileV2NavigationGroup {
  id: MobileV2NavigationGroupId;
  label: string;
  description: string;
  icon: DestinationIcon;
  tone: string;
  destinations: readonly MobileV2Destination[];
}

/** Support is a Workspace destination on the phone, never an Operations branch. */
export type MobileV2NavigationGroupId = 'floor' | Exclude<DomainGroupId, 'support'>;

type OperationLane = Exclude<(typeof DOMAIN_GROUPS)[number], { id: 'support' }>;

export interface MobileV2NavigationFamily {
  id: SpineNavigationBand;
  label: string;
  description: string;
  icon: DestinationIcon;
  tone: string;
  destinations?: readonly MobileV2Destination[];
  groups?: readonly MobileV2NavigationGroup[];
}

/**
 * Mobile routes are implementation details of the phone surface. The root
 * taxonomy is not: it comes from the desktop navigation bands below.
 */
export const MOBILE_V2_DESTINATIONS: readonly MobileV2Destination[] = [
  {
    id: 'customers',
    label: 'Customers',
    description: 'Buyer identity and complete order history',
    href: CUSTOMER_PATHS.mobile,
    icon: User,
    tone: 'text-sky-600',
    requires: 'orders.view',
  },
  {
    id: 'qc',
    label: 'Quality control',
    description: 'Returns, repairs and newly unboxed units',
    href: QUALITY_CONTROL_PATHS.mobile,
    icon: TECH_NAV_ICONS.testing,
    tone: 'text-violet-600',
    requires: 'tech.qc_pass',
  },
  {
    id: 'prepack',
    label: 'Prepack',
    description: 'Scan a serial, grade each package, print its labels',
    href: PREPACK_PATHS.form,
    icon: PackageCheck,
    tone: 'text-teal-600',
    requires: 'tech.scan_serial',
  },
  {
    id: 'stock',
    label: 'Stock',
    description: 'Find and adjust stock by room',
    href: WAREHOUSE_PATHS.stock,
    icon: Package,
    tone: 'text-emerald-600',
    requires: 'sku_stock.view',
  },
  {
    id: 'products',
    label: 'Products',
    description: 'Catalog identity, listings and product photos',
    href: '/m/products',
    icon: DOMAIN_GROUPS.find(({ id }) => id === 'catalog')!.icon,
    tone: 'text-amber-600',
    requires: 'sku_stock.view',
  },
  {
    id: 'orders',
    label: 'Allocate',
    description: 'Triage online and pickup work',
    href: '/m/orders',
    icon: LayoutDashboard,
    tone: 'text-blue-600',
  },
  {
    id: 'pick',
    label: 'Pick',
    description: 'Pick orders from inventory',
    href: '/m/pick',
    icon: TECH_NAV_ICONS.shipping,
    tone: 'text-emerald-600',
  },
  {
    id: 'receiving',
    label: 'Receiving',
    description: 'Unbox and receive inventory',
    href: '/m/receiving',
    icon: STATION_PAGE_ICONS.receiving,
    tone: 'text-blue-600',
  },
  {
    id: 'inbound-new',
    label: 'Add purchase orders',
    description: 'Type, paste, photograph or upload a CSV',
    href: '/m/receiving/new',
    icon: Inbox,
    tone: 'text-blue-600',
    requires: 'receiving.view',
  },
  {
    id: 'print',
    label: 'Print station',
    description: 'Labels and order documents',
    href: '/print-station',
    icon: Printer,
    tone: 'text-sky-600',
    requires: 'print.label',
  },
  {
    id: 'labels',
    label: 'Location labels',
    description: 'Print location and bay stickers, one or a run',
    href: WAREHOUSE_PATHS.locationLabels,
    icon: Tag,
    tone: 'text-sky-600',
    requires: 'print.label',
  },
  {
    id: 'locations',
    label: 'Manage locations',
    description: 'Rename and clear empty positions',
    href: WAREHOUSE_PATHS.locationCleanup,
    icon: Trash2,
    tone: 'text-emerald-600',
    requires: 'bin.remove',
  },
  {
    id: 'racks',
    label: 'Racks',
    description: 'Movable racks and their shelves',
    href: WAREHOUSE_PATHS.racks,
    icon: Warehouse,
    tone: 'text-emerald-600',
    requires: 'sku_stock.view',
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Live pick and pack throughput by staff',
    href: '/m/reports',
    icon: BarChart3,
    tone: 'text-indigo-600',
    requires: 'operations.view',
  },
  {
    id: 'exceptions',
    label: 'Exceptions',
    description: 'Work that needs attention',
    href: '/m/exceptions',
    icon: AlertTriangle,
    tone: 'text-amber-600',
  },
] as const;

/** Top-level desktop rows that already have focused phone surfaces. */
export const MOBILE_V2_UTILITY_DESTINATIONS: readonly MobileV2Destination[] = [
  ...MOBILE_V2_DESTINATIONS.filter(({ id }) => id === 'print' || id === 'reports'),
  {
    id: 'settings',
    label: 'Settings',
    description: 'Account, device and application preferences',
    href: '/m/settings',
    icon: Settings,
    tone: 'text-text-soft',
  },
] as const;

export const MOBILE_V2_WORKSPACE_DESTINATIONS: readonly MobileV2Destination[] = [
  {
    id: 'home',
    label: 'Tasks',
    description: 'Daily work, follow-ups and projects',
    href: '/m/home',
    icon: ListChecks,
    tone: 'text-blue-600',
  },
  // Support is its own workspace (owner 2026-10-04), not a Tasks mode: the list and one record on the phone.
  {
    id: 'support',
    label: 'Support',
    description: 'Customer conversations and internal records',
    href: SUPPORT_PATHS.mobile,
    icon: TicketHelp,
    tone: 'text-orange-600',
    requires: 'support.thread.view',
  },
  // The Live feed (desktop: the leading Operations row) — every outbound package by stage, one column per tab.
  {
    id: 'live-feed',
    label: 'Live feed',
    description: 'Every package by stage: to pick, picked, packed, scanned out',
    href: LIVE_FEED_MOBILE_PATH,
    icon: Radar,
    tone: 'text-orange-600',
    requires: LIVE_FEED_PERMISSION,
  },
  ...MOBILE_V2_DESTINATIONS.filter(({ id }) => id === 'exceptions'),
] as const;

/**
 * Fulfillment's desktop page hierarchy, painted in the same order on mobile.
 * Unported pages remain in the shared contract but are omitted from the phone
 * menu until a native surface exists.
 */
export const MOBILE_V2_FULFILLMENT_DESTINATIONS: readonly MobileV2Destination[] = [
  {
    id: 'fulfilled',
    label: 'Fulfilled',
    description: 'Every order since it left: carrier, delivery and check-in',
    href: FULFILLED_PATHS.mobile,
    icon: PackageCheck,
    tone: 'text-emerald-600',
    requires: 'packing.view',
  },
  {
    id: 'fbm',
    label: 'FBM',
    description: 'Allocate merchant-fulfilled orders',
    href: '/m/orders',
    icon: STATION_PAGE_ICONS.outbound,
    tone: 'text-blue-600',
    requires: 'orders.view',
  },
  {
    id: 'fba',
    label: 'FBA',
    description: 'Fulfilled by Amazon',
    href: OUTBOUND_MODE_PATHS.fba,
    icon: SHIPPING_NAV_ICONS.fba,
    tone: 'text-purple-600',
    requires: 'fba.view',
    ported: false,
  },
] as const;

const MOBILE_DESTINATION_BY_ID = new Map(
  MOBILE_V2_DESTINATIONS.map((destination) => [destination.id, destination] as const),
);

const GROUP_DESCRIPTION: Readonly<Record<MobileV2NavigationGroupId, string>> = {
  floor: 'Quality control and picking stations',
  sales: 'Customers and sales history',
  inbound: 'Purchase orders and arrivals',
  fulfillment: 'Allocate, pick, pack and ship',
  inventory: 'On-hand stock, low stock and replenishment',
  warehouse: 'Locations, racks and labels',
  catalog: 'Catalog identity, listings and photos',
};

const GROUP_DESTINATION_IDS: Readonly<Record<MobileV2NavigationGroupId, readonly string[]>> = {
  floor: ['qc', 'prepack', 'pick'],
  sales: ['customers'],
  inbound: ['receiving', 'inbound-new'],
  fulfillment: [],
  inventory: ['stock'],
  warehouse: ['locations', 'labels', 'racks'],
  catalog: ['products'],
};

/**
 * Operations branches preserve the desktop's station-first order followed by
 * the canonical domain order. Support is a Workspace row (above), not an
 * Operations branch.
 */
export const MOBILE_V2_OPERATION_GROUPS: readonly MobileV2NavigationGroup[] = [
  {
    id: 'floor',
    label: 'Scan Stations',
    icon: ScanBarcode,
    tone: 'text-teal-600',
    description: GROUP_DESCRIPTION.floor,
    destinations: GROUP_DESTINATION_IDS.floor
      .map((id) => MOBILE_DESTINATION_BY_ID.get(id))
      .filter((destination): destination is MobileV2Destination => Boolean(destination)),
  },
  ...DOMAIN_GROUPS.filter((group): group is OperationLane => group.id !== 'support').map((group) => ({
    id: group.id,
    label: group.label,
    icon: group.icon,
    tone: spineParentTone(group.id).icon,
    description: GROUP_DESCRIPTION[group.id],
    destinations: group.id === 'fulfillment'
      ? MOBILE_V2_FULFILLMENT_DESTINATIONS
      : GROUP_DESTINATION_IDS[group.id]
          .map((id) => MOBILE_DESTINATION_BY_ID.get(id))
          .filter((destination): destination is MobileV2Destination => Boolean(destination)),
  })),
] as const;

const FAMILY_PRESENTATION: Readonly<Record<SpineNavigationBand, {
  description: string;
  icon: DestinationIcon;
  tone: string;
}>> = {
  utility: {
    description: 'Tasks, Support, exceptions and shared work',
    icon: LayoutDashboard,
    tone: 'text-blue-600',
  },
  business: {
    description: 'Warehouse, sales and fulfillment',
    icon: ScanBarcode,
    tone: 'text-teal-600',
  },
  bottom: {
    description: 'Printing, reports and settings',
    icon: Printer,
    tone: 'text-indigo-600',
  },
};

/** Mobile-capable desktop navigation bands, preserving canonical desktop order. */
export const MOBILE_V2_NAVIGATION_FAMILIES: readonly MobileV2NavigationFamily[] =
  SPINE_NAVIGATION_BAND_ORDER.map((id) => ({
    id,
    label: spineNavigationBandTitle(id),
    ...FAMILY_PRESENTATION[id],
    ...(id === 'utility' ? { destinations: MOBILE_V2_WORKSPACE_DESTINATIONS } : {}),
    ...(id === 'business' ? { groups: MOBILE_V2_OPERATION_GROUPS } : {}),
    ...(id === 'bottom' ? { destinations: MOBILE_V2_UTILITY_DESTINATIONS } : {}),
  }));

/** FBM's shared children; unported children stay in the contract and are omitted by the renderer. */
export const MOBILE_V2_FBM_DESTINATIONS: readonly MobileV2Destination[] = FBM_DESTINATIONS.map(
  (destination) => ({
    id: destination.id,
    label: destination.label,
    description: destination.description,
    href: destination.mobileHref ?? destination.pathname,
    icon: destination.icon,
    tone: destination.tone,
    requires: destination.requires,
    ...(destination.mobileHref ? {} : { ported: false as const }),
  }),
);
