/** Backward-compatible wrapper around the canonical receiving_lines-first Zoho inbound sync service. */

export {
  importZohoPurchaseOrderToReceiving,
  syncZohoPurchaseOrdersToReceiving,
  type ImportPOResult,
  type BulkSyncOptions,
  type BulkSyncSummary,
} from '@/lib/zoho-receiving-sync';
