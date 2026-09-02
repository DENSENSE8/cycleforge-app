/**
 * Pure payload builder for Incoming Add — testable without React.
 */

import {
  inboundSourcePlatformForRaw,
  inboundSourceTypeForPlatform,
} from '@/lib/inbound/desk-csv';

export interface BuildAddInboundImportBodyInput {
  platform: string;
  receivingType: string;
  priority: string;
  orderId: string;
  sku: string;
  itemName: string;
  pickedCatalogId: number | null;
  quantity: string;
  trackingNumber: string;
  listingUrl: string;
  seller: string;
  accountName: string;
  returnReason: string;
  rmaId: string;
  carrierCode?: string;
  lineItemId?: string;
}

const PRIORITY_AUTO = 'auto';

export function buildAddInboundImportBody(input: BuildAddInboundImportBodyInput): Record<string, unknown> {
  const isReturn = input.receivingType === 'RETURN';
  const qty = Number(input.quantity);
  const sourceType = inboundSourceTypeForPlatform(input.platform);
  const sourcePlatform = inboundSourcePlatformForRaw(input.platform);
  const priorityTier =
    input.priority === PRIORITY_AUTO ? null : Number(input.priority);

  const body: Record<string, unknown> = {
    kind: isReturn ? 'return' : 'purchase',
    source_type: sourceType,
    source_platform: sourcePlatform,
    receiving_type: input.receivingType,
    priority_tier: priorityTier,
    order_id: input.orderId.trim(),
    sku: input.sku.trim() || undefined,
    item_name: input.itemName.trim() || undefined,
    quantity: Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1,
    tracking_number: input.trackingNumber.trim() || undefined,
    listing_url: input.listingUrl.trim() || undefined,
    seller: input.seller.trim() || undefined,
    account_name: input.accountName.trim() || undefined,
    carrier_code: input.carrierCode?.trim() || undefined,
    line_item_id: input.lineItemId?.trim() || undefined,
  };

  if (input.pickedCatalogId != null) {
    body.sku_catalog_id = input.pickedCatalogId;
  }

  if (isReturn) {
    body.return_reason = input.returnReason.trim() || undefined;
    body.rma_id = input.rmaId.trim() || undefined;
  }

  return body;
}

export function canSubmitAddInbound(input: BuildAddInboundImportBodyInput): boolean {
  const isReturn = input.receivingType === 'RETURN';
  const hasItem = Boolean(input.sku.trim() || input.itemName.trim());
  if (
    !input.orderId.trim()
    || !input.platform.trim()
    || !input.receivingType.trim()
    || !hasItem
  ) {
    return false;
  }
  if (isReturn) {
    return Boolean(input.trackingNumber.trim() && input.pickedCatalogId != null);
  }
  return true;
}
