/** Human label for a receiving type code (PO / RETURN / REPAIR / TRADE_IN / PICKUP). */

import { receivingTypeMeta } from './receiving-type-meta';

export function receivingLabelTypeDisplay(code: string | null | undefined): string {
  const key = String(code ?? '').trim();
  if (!key) return '';
  return receivingTypeMeta(key).label;
}
