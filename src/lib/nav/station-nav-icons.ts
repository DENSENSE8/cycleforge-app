/**
 * Station nav icon registry — maps sidebar page / child-page ids to semantic
 * icon components from `@/components/Icons`. Single write path for
 * SIDEBAR_PAGE_NAV data, the receiving rail, tech top pills, and shipping.
 *
 * MasterNav renders {@link STATION_PAGE_ICONS} (and other page SoT icons).
 * **Every spine row draws its glyph at the same 1.5 page stroke — parent rows
 * and child rows alike** (reversed 2026-08-02: at 2.25 a child glyph out-drew
 * its own parent, inverting the ladder it was meant to express). The heavier
 * 2.25 survives only where a glyph is the WHOLE control — the GlobalHeader page
 * switcher, header "now" identity, scan rails, `HorizontalButtonSlider`. See
 * icons/stations.tsx + icons/nav-weight.tsx.
 *
 * Glyphs must stay unique across floor stations — enforced via
 * {@link STATION_GLYPH_KEYS}.
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

/** Receiving spine rows + the receiving rail (`RECEIVING_MODE_ITEMS`, SIDEBAR_PAGE_NAV). */
export const RECEIVING_NAV_ICONS = {
  incoming: ReceivingModeIncoming,
  triage: ReceivingModeArrival,
  receive: ReceivingModeUnbox,
  pickup: ReceivingModePickup,
  repair: ReceivingModeRepair,
} as const satisfies Record<string, NavIconComponent>;

/** Testing's child pages (`TechSidebarTopMode`; the switcher lives in GlobalHeader). */
export const TECH_NAV_ICONS = {
  testing: TechModeTesting,
  shipping: TechModeShippingQueue,
} as const satisfies Record<string, NavIconComponent>;

/**
 * Shipping's child pages (`SIDEBAR_PAGE_NAV` outbound children) — plus
 * `scan-out`, which is a floor station L1 row of its own and only borrows this
 * map for its glyph.
 */
export const SHIPPING_NAV_ICONS = {
  labels: ShippingModeLabels,
  ready: ShippingModeReady,
  fba: ShippingModeFba,
  'scan-out': ShippingModeScanOut,
} as const satisfies Record<string, NavIconComponent>;

/**
 * Packing STYLES — standard / fragile / multi. Deliberately not renamed with
 * the nav maps above (2026-08-03): these are a genuine mode vocabulary, not
 * child pages (`/pack` declares no `children`), and nothing consumes them today.
 */
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
export const STATION_GLYPH_KEYS = {
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
