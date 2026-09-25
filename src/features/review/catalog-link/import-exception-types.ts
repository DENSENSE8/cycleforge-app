/** Client-safe types for Review · Missing item number (no server-only imports). */

export type ImportExceptionStatus = 'open' | 'resolved' | 'ignored';

/** Why the import row was quarantined. Only `no_item_number` resolves by
 *  typing an item number; the ShipStation reasons clear on the next sync. */
export type ImportExceptionReason = 'no_item_number' | 'shipstation_unknown_store' | 'shipstation_ambiguous_match';

/** Operator wording for each reason: what is wrong, and what clears it. */
export const IMPORT_EXCEPTION_REASON_TEXT: Record<ImportExceptionReason, { label: string; hint: string }> = {
  no_item_number: {
    label: 'Missing item number',
    hint: 'Supply the item number to import the order.',
  },
  shipstation_unknown_store: {
    label: 'ShipStation store has no platform',
    hint: 'Bind the ShipStation store to a platform account; the next ShipStation sync imports the order.',
  },
  shipstation_ambiguous_match: {
    label: 'Order number under several platforms',
    hint: 'Clear the conflicting orders; the next ShipStation sync imports the order.',
  },
};

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
