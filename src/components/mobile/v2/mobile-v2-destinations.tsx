import type { ComponentType } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Inbox,
  LayoutDashboard,
  ListChecks,
  PackageCheck,
  Printer,
  ScanBarcode,
  Settings,
  Tag,
  Trash2,
  User,
  Warehouse,
} from '@/components/Icons';
import {
  DOMAIN_GROUPS,
  type DomainGroupId,
} from '@/lib/nav/lanes';
import { SHIPPING_NAV_ICONS, STATION_PAGE_ICONS, TECH_NAV_ICONS } from '@/lib/nav/station-nav-icons';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';
import { spineParentTone } from '@/lib/nav/spine-parent-tone';
import {
  SPINE_NAVIGATION_BAND_ORDER,
  spineNavigationBandTitle,
  type SpineNavigationBand,
} from '@/lib/nav/spine-navigation-band';
import { OUTBOUND_MODE_PATHS } from '@/lib/outbound/route-contract';
import { SHIPPING_LABEL_INTAKE_PATH } from '@/lib/shipping/orders-desk';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';

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

export type MobileV2NavigationGroupId = 'floor' | Exclude<DomainGroupId, 'support'>;

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
    href: '/m/customers',
    icon: User,
    tone: 'text-sky-600',
    requires: 'orders.view',
  },
  {
    id: 'qc',
    label: 'Quality control',
    description: 'Returns, repairs and newly unboxed units',
    href: '/m/qc',
    icon: TECH_NAV_ICONS.testing,
    tone: 'text-violet-600',
    requires: 'tech.qc_pass',
  },
  {
    id: 'stock',
    label: 'Stock',
    description: 'Find and adjust stock by room',
    href: WAREHOUSE_PATHS.stock,
    icon: DOMAIN_GROUPS.find(({ id }) => id === 'inventory')!.icon,
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
    description: 'Every package that left the building',
    href: SHIPPING_SHIPPED_PATH,
    icon: PackageCheck,
    tone: 'text-emerald-600',
    requires: 'packing.view',
    ported: false,
  },
  {
    id: 'fbm',
    label: 'FBM',
    description: 'Allocate merchant-fulfilled orders',
    href: '/m/orders',
    icon: STATION_PAGE_ICONS.outbound,
    tone: 'text-blue-600',
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
  {
    id: 'label-intake',
    label: 'Labels & docs',
    description: 'Labels, paperwork and printing',
    href: SHIPPING_LABEL_INTAKE_PATH,
    icon: SHIPPING_NAV_ICONS.labels,
    tone: 'text-teal-600',
    requires: 'packing.review',
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
  inventory: 'Stock, locations and adjustments',
  catalog: 'Catalog identity, listings and photos',
};

const GROUP_DESTINATION_IDS: Readonly<Record<MobileV2NavigationGroupId, readonly string[]>> = {
  floor: ['qc', 'pick'],
  sales: ['customers'],
  inbound: ['receiving', 'inbound-new'],
  fulfillment: [],
  inventory: ['stock', 'locations', 'labels', 'racks'],
  catalog: ['products'],
};

/**
 * Operations branches preserve the desktop's station-first order followed by
 * the canonical domain order. Support is hidden by the mobile-first gate on
 * desktop (`LANE_MOBILE_FIRST.support`) and has no mobile Operations branch.
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
  ...DOMAIN_GROUPS.filter((group) => group.id !== 'support').map((group) => ({
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
    description: 'Tasks, exceptions and shared work',
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

/** FBM is one desktop lane page; these are its task-focused phone faces. */
export const MOBILE_V2_FBM_DESTINATIONS: readonly MobileV2Destination[] = MOBILE_V2_DESTINATIONS.filter(
  ({ id }) => id === 'orders',
);
