/** Client-safe types for Review · Catalog link (no server-only imports). */

export type CatalogLinkChoreStatus = 'open' | 'linked' | 'ignored';

export type CatalogLinkChoreRow = {
  id: number;
  itemNumber: string;
  accountSource: string;
  productTitle: string | null;
  sku: string | null;
  status: CatalogLinkChoreStatus;
  skuCatalogId: number | null;
  orderCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};
