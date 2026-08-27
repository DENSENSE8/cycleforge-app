/**
 * Global Header Add menu — curated create/import intents.
 *
 * Each item navigates to an owning desk and optionally parks an intent the
 * surface consumes on mount (Incoming leaves, Support create, FBA plan).
 */

import { INCOMING_SURFACE_ROUTE, REPAIR_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { FBA_OUTBOUND_PATH } from '@/lib/fba/fba-modes';
import { inventoryLocationsHref } from '@/lib/inventory/locations-path';

/** Matches {@link IncomingAddInitialLeaf} without importing the overlay module. */
export type GlobalAddIncomingLeaf =
  | 'index'
  | 'add-po'
  | 'add-return'
  | 'import-returns';

export const GLOBAL_ADD_INTENT_EVENT = 'cycleforge:global-add' as const;
export const GLOBAL_ADD_INTENT_KEY = 'cf:global-add-intent';

export type GlobalAddIntent =
  | { kind: 'incoming-add'; leaf: GlobalAddIncomingLeaf }
  | { kind: 'incoming-import-zoho' }
  | { kind: 'incoming-import-ebay' }
  | { kind: 'support-create-ticket' }
  | { kind: 'fba-create-plan' }
  | { kind: 'fba-quick-add-fnsku' }
  | { kind: 'locations-new' };

export type GlobalAddItemId =
  | 'orders-manual'
  | 'orders-csv'
  | 'orders-sync'
  | 'orders-backfill'
  | 'fba-plan'
  | 'fba-fnsku'
  | 'incoming-po'
  | 'incoming-return'
  | 'incoming-returns-csv'
  | 'incoming-zoho'
  | 'incoming-ebay'
  | 'catalog-sku'
  | 'support-ticket'
  | 'repair-new'
  | 'sale-new'
  | 'pickup-new'
  | 'location-new'
  | 'room-new';

export type GlobalAddGroupId =
  | 'outbound'
  | 'inbound'
  | 'catalog'
  | 'support'
  | 'sales'
  | 'inventory';

export type GlobalAddItem = {
  id: GlobalAddItemId;
  label: string;
  subtitle: string;
  /** Permission id — omit when always visible to authenticated operators. */
  permission?: string;
  href: string;
  intent?: GlobalAddIntent;
};

export type GlobalAddGroup = {
  id: GlobalAddGroupId;
  label: string;
  items: readonly GlobalAddItem[];
};

export const GLOBAL_ADD_GROUPS: readonly GlobalAddGroup[] = [
  {
    id: 'outbound',
    label: 'Outbound',
    items: [
      {
        id: 'orders-manual',
        label: 'Add order manually',
        subtitle: 'New order, entered here',
        href: `${SHIPPING_ORDERS_PATH}?new=true`,
      },
      {
        id: 'orders-csv',
        label: 'Import orders (CSV)',
        subtitle: 'Desk staging → To-ship',
        permission: 'orders.import',
        href: `${SHIPPING_ORDERS_PATH}?ingest=true`,
      },
      {
        id: 'orders-sync',
        label: 'Import latest orders',
        subtitle: 'Google Sheet + Ecwid refresh',
        permission: 'orders.import',
        href: `${SHIPPING_ORDERS_PATH}?ingest=true`,
      },
      {
        id: 'orders-backfill',
        label: 'Backfill orders',
        subtitle: 'eBay / Ecwid catch-up',
        permission: 'orders.import',
        href: `${SHIPPING_ORDERS_PATH}?ingest=true`,
      },
      {
        id: 'fba-plan',
        label: 'New FBA plan',
        subtitle: 'Create FBA shipment plan',
        href: FBA_OUTBOUND_PATH,
        intent: { kind: 'fba-create-plan' },
      },
      {
        id: 'fba-fnsku',
        label: 'Quick add FNSKU',
        subtitle: 'Amazon SKU details for FBA',
        href: FBA_OUTBOUND_PATH,
        intent: { kind: 'fba-quick-add-fnsku' },
      },
    ],
  },
  {
    id: 'inbound',
    label: 'Inbound',
    items: [
      {
        id: 'incoming-po',
        label: 'Add PO',
        subtitle: 'Purchase or marketplace order',
        href: INCOMING_SURFACE_ROUTE,
        intent: { kind: 'incoming-add', leaf: 'add-po' },
      },
      {
        id: 'incoming-return',
        label: 'Add return',
        subtitle: 'Return with linked support ticket',
        href: INCOMING_SURFACE_ROUTE,
        intent: { kind: 'incoming-add', leaf: 'add-return' },
      },
      {
        id: 'incoming-returns-csv',
        label: 'Import returns (CSV/TSV)',
        subtitle: 'Amazon Manage Returns · desk CSV',
        href: INCOMING_SURFACE_ROUTE,
        intent: { kind: 'incoming-add', leaf: 'import-returns' },
      },
      {
        id: 'incoming-zoho',
        label: 'Import Zoho POs',
        subtitle: 'Expected inbound from Zoho',
        href: INCOMING_SURFACE_ROUTE,
        intent: { kind: 'incoming-import-zoho' },
      },
      {
        id: 'incoming-ebay',
        label: 'Import eBay purchases',
        subtitle: 'Live eBay inbound pull',
        permission: 'integrations.ebay',
        href: INCOMING_SURFACE_ROUTE,
        intent: { kind: 'incoming-import-ebay' },
      },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      {
        id: 'catalog-sku',
        label: 'Add inventory SKU',
        subtitle: 'New sku_catalog row',
        href: '/products?view=pairing',
      },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    items: [
      {
        id: 'support-ticket',
        label: 'New support ticket',
        subtitle: 'Zendesk / support station entry',
        permission: 'integrations.zendesk',
        href: '/support?createTicket=1',
        intent: { kind: 'support-create-ticket' },
      },
    ],
  },
  {
    id: 'sales',
    label: 'Sales and service',
    items: [
      {
        id: 'repair-new',
        label: 'New repair order',
        subtitle: 'Repair intake',
        href: `${REPAIR_SURFACE_ROUTE}?new=true`,
      },
      {
        id: 'sale-new',
        label: 'New sale',
        subtitle: 'Square terminal charge',
        href: '/walk-in',
      },
      {
        id: 'pickup-new',
        label: 'New local pickup',
        subtitle: 'Seller drop-off intake',
        href: '/pickup',
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    items: [
      {
        id: 'location-new',
        label: 'New location',
        subtitle: 'Warehouse bin / location',
        href: inventoryLocationsHref({ tab: 'bins' }),
        intent: { kind: 'locations-new' },
      },
      {
        id: 'room-new',
        label: 'New room',
        subtitle: 'Warehouse room',
        href: inventoryLocationsHref({ tab: 'rooms', extra: { new: '1' } }),
      },
    ],
  },
] as const;

export function parkGlobalAddIntent(intent: GlobalAddIntent): void {
  try {
    sessionStorage.setItem(GLOBAL_ADD_INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* private mode — event alone still works same-tab */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GLOBAL_ADD_INTENT_EVENT, { detail: intent }));
  }
}

export function consumeGlobalAddIntent(): GlobalAddIntent | null {
  try {
    const raw = sessionStorage.getItem(GLOBAL_ADD_INTENT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(GLOBAL_ADD_INTENT_KEY);
    return JSON.parse(raw) as GlobalAddIntent;
  } catch {
    return null;
  }
}

export function peekGlobalAddIntent(): GlobalAddIntent | null {
  try {
    const raw = sessionStorage.getItem(GLOBAL_ADD_INTENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GlobalAddIntent;
  } catch {
    return null;
  }
}
