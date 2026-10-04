/** Client-safe row types for catalog-link chores and order-import exceptions (no server-only imports). */

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

export type ImportExceptionStatus = 'open' | 'resolved' | 'ignored';

/** Why the import row was quarantined. Only `no_item_number` resolves by
 *  typing an item number; the ShipStation reasons clear on the next sync. */
export type ImportExceptionReason = 'no_item_number' | 'shipstation_unknown_store' | 'shipstation_ambiguous_match';

export type ImportExceptionRow = {
  id: number;
  accountOrderId: string;
  accountSource: string;
  reason: ImportExceptionReason;
  productTitle: string | null;
  tracking: string | null;
  status: ImportExceptionStatus;
  sheetRow: number | null;
  resolvedItemNumber: string | null;
  resolvedOrderId: number | null;
  seenCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};
