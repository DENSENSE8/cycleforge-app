/** React- and database-free contract shared by dock staging routes and phone UI. */
export type DockStagingCandidate = {
  id: number;
  shipmentId: number;
  orderId: string;
  productTitle: string;
  sku: string | null;
  itemNumber: string | null;
  tracking: string | null;
  quantity: number | null;
  imageUrl: string | null;
  locationCode: string | null;
  stagedAt: string | null;
};

/** Scanner input stored with the staging event; deliberately not a free-text note. */
export function normalizeDockLocation(raw: unknown): string | null {
  const normalized = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9._/-]/g, '');
  return normalized.length >= 2 && normalized.length <= 64 ? normalized : null;
}
