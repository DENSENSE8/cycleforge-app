/**
 * Station nav icon registry — maps sidebar page / mode ids to semantic icon
 * components from `@/components/Icons`. Single write path for SIDEBAR_PAGE_NAV
 * data, receiving mode pills, tech top-mode pills, shipping modes, and packing
 * modes.
 *
 * MasterNav L1 renders {@link STATION_PAGE_ICONS} (and other page SoT icons).
 * Mode stroke is heavier than page (see icons/stations.tsx + icons/nav-weight.tsx).
 * Mode *glyphs* must be unique across floor stations — enforced via
 * {@link MODE_ICON_GLYPH_KEYS}.
 */

import {
  PackingModeFragile,
  PackingModeMulti,
  PackingModeStandard,
  ReceivingModeArrival,
  ReceivingModeIncoming,
  ReceivingModePickup,
  ReceivingModeRepair,
  ReceivingModeUnbox,
  ShippingModeFba,
  ShippingModeLabels,
  ShippingModeReady,
  ShippingModeScanOut,
  StationPacking,
  StationReceiving,
  StationShipping,
  StationTesting,
  TechModeShippingQueue,
  TechModeTesting,
} from '@/components/Icons';

type NavIconComponent = (props: { className?: string }) => JSX.Element;

type StationPageId = 'receiving' | 'outbound' | 'tech' | 'packer';

/**
 * Floor-station page icons on SIDEBAR_PAGE_NAV / APP_SIDEBAR_NAV data.
 * Rendered in MasterNav L1; mobile page rows stay label-only for now.
 */
export const STATION_PAGE_ICONS: Record<StationPageId, NavIconComponent> = {
  receiving: StationReceiving,
  outbound: StationShipping,
  tech: StationTesting,
  packer: StationPacking,
};

/** Receiving sidebar / header mode rail (`RECEIVING_MODE_ITEMS`, SIDEBAR_PAGE_NAV). */
export const RECEIVING_MODE_ICONS = {
  incoming: ReceivingModeIncoming,
  triage: ReceivingModeArrival,
  receive: ReceivingModeUnbox,
  pickup: ReceivingModePickup,
  repair: ReceivingModeRepair,
} as const satisfies Record<string, NavIconComponent>;

/** Testing sidebar top-mode pills (`TECH_TOP_MODE_ITEMS`, SIDEBAR_PAGE_NAV tech modes). */
export const TECH_MODE_ICONS = {
  testing: TechModeTesting,
  shipping: TechModeShippingQueue,
} as const satisfies Record<string, NavIconComponent>;

/** Shipping station L2 modes (`SIDEBAR_PAGE_NAV` outbound modes). */
export const SHIPPING_MODE_ICONS = {
  labels: ShippingModeLabels,
  ready: ShippingModeReady,
  fba: ShippingModeFba,
  'scan-out': ShippingModeScanOut,
} as const satisfies Record<string, NavIconComponent>;

/** Packing station L2 modes. */
export const PACKING_MODE_ICONS = {
  standard: PackingModeStandard,
  fragile: PackingModeFragile,
  multi: PackingModeMulti,
} as const satisfies Record<string, NavIconComponent>;

/**
 * Underlying primitive name for every floor-station L2 mode.
 * Uniqueness is the hard law — Arrival Truck ≠ Tech Shipping Send, etc.
 * Pages may reuse a glyph with their default mode (data only — chrome renders modes).
 */
export const MODE_ICON_GLYPH_KEYS = {
  'receiving.incoming': 'Inbox',
  'receiving.triage': 'Truck',
  'receiving.receive': 'PackageOpen',
  'receiving.pickup': 'ShoppingCart',
  'receiving.repair': 'Wrench',
  'tech.testing': 'ShieldCheck',
  'tech.shipping': 'Send',
  'shipping.labels': 'Printer',
  'shipping.ready': 'ClipboardList',
  'shipping.fba': 'Boxes',
  'shipping.scan-out': 'Barcode',
  'packing.standard': 'Box',
  'packing.fragile': 'AlertTriangle',
  'packing.multi': 'Package',
} as const;

export function stationPageIcon(pageId: StationPageId): NavIconComponent {
  return STATION_PAGE_ICONS[pageId];
}
