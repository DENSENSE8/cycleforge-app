/** Client-safe contracts for the mobile customer directory and throughput record. */

export interface CustomerDirectoryEntry {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  place: string | null;
  orderCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  platforms: string[];
  recentOrder: {
    id: number;
    orderRef: string | null;
    productTitle: string | null;
    status: string | null;
    platform: string | null;
    placedAt: string | null;
  } | null;
}

export interface CustomerOrderLine {
  id: number;
  title: string | null;
  sku: string | null;
  itemNumber: string | null;
  condition: string | null;
  quantity: number;
  amount: number | null;
  currency: string | null;
}

export interface CustomerOrderHistoryEntry {
  /** Public marketplace order number; null only for a malformed legacy row. */
  orderRef: string | null;
  /** Stable fallback for opening a legacy order without a public number. */
  primaryOrderId: number;
  placedAt: string | null;
  status: string | null;
  platform: string | null;
  totalAmount: number | null;
  currency: string | null;
  items: CustomerOrderLine[];
}

export interface CustomerDirectoryPayload {
  ok: true;
  customers: CustomerDirectoryEntry[];
}

export interface CustomerOrderHistoryPayload {
  ok: true;
  orders: CustomerOrderHistoryEntry[];
}
