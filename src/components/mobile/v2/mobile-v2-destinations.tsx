import type { ComponentType } from 'react';
import {
  AlertTriangle,
  LayoutDashboard,
  PackageCheck,
  Printer,
} from '@/components/Icons';
import { domainLane } from '@/lib/nav/lanes';
import { SHIPPING_NAV_ICONS, STATION_PAGE_ICONS, TECH_NAV_ICONS } from '@/lib/nav/station-nav-icons';
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
  /** Visible hierarchy placeholder until the destination has a native V2 surface. */
  ported?: boolean;
}

/**
 * V2's intentionally shallow application map. These are operator destinations,
 * not a mirror of the desktop sidebar's internal lane hierarchy.
 */
export const MOBILE_V2_DESTINATIONS: readonly MobileV2Destination[] = [
  {
    id: 'stock',
    label: 'Stock',
    description: 'Rooms, quantities and adjustments',
    href: '/m/stock',
    icon: domainLane('inventory').icon,
    tone: 'text-emerald-600',
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
    id: 'pack',
    label: 'Pack',
    description: 'Pack and prepare shipments',
    href: '/m/pack',
    icon: STATION_PAGE_ICONS.packer,
    tone: 'text-purple-600',
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
    id: 'print',
    label: 'Print station',
    description: 'Labels and order documents',
    href: '/print-station',
    icon: Printer,
    tone: 'text-sky-600',
    requires: 'print.label',
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

/**
 * Fulfillment's desktop page hierarchy, painted in the same order on mobile.
 * Unported pages stay visible as disabled promises instead of silently
 * inventing a different mobile information architecture.
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
    description: 'Allocate and resolve merchant-fulfilled orders',
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
