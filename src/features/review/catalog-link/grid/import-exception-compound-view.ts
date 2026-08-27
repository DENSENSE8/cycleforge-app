/**
 * Import exception → {@link CompoundRowView}. Pure; no React, no hooks.
 */

import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { firstNote } from '@/components/tables/compound/compound-row-model';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';

export function importExceptionCompoundView(row: ImportExceptionRow): CompoundRowView {
  const platform = sourcePlatformMetaFromLabel(row.accountSource);

  return {
    id: String(row.id),
    thumbUrl: null,
    title: row.productTitle?.trim() || row.accountOrderId,
    note: firstNote([
      row.sheetRow != null ? `Sheet row ${row.sheetRow}` : null,
      row.seenCount > 1 ? `Seen ×${row.seenCount}` : null,
    ]),
    orderId: row.accountOrderId,
    tracking: row.tracking,
    platformValue: platform.value || null,
    carrier: null,
    stateLabel: 'No item #',
    stateTone: 'alert',
    stateTip: 'Sheet row never became an order — supply the listing item number',
    amount: null,
    delay: null,
  };
}
