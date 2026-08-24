/** Client-safe types for Review · Missing item number (no server-only imports). */

export type ImportExceptionStatus = 'open' | 'resolved' | 'ignored';

export type ImportExceptionRow = {
  id: number;
  accountOrderId: string;
  accountSource: string;
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
