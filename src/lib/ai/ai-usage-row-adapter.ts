/**
 * `AiUsageTableRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * The amount is PRE-FORMATTED by the adapter, per the view model's contract:
 * currency is a tenant/locale decision that belongs to the family's own SoT, not
 * to a table cell that would have to grow an opinion about minor units.
 */

import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { formatAiUsageCost } from '@/lib/tables/field-catalog/ai-usage-resolve';
import type { AiUsageTableRow } from '@/lib/ai/ai-usage-row';

export function aiUsageCompoundView(row: AiUsageTableRow): CompoundRowView {
  const capability = String(row.capability ?? '').trim();
  const context = String(row.context ?? '').trim();
  return {
    id: row.key,
    thumbUrl: null,
    title: String(row.model ?? '').trim() || 'unknown model',
    note: capability && context ? `${capability} · ${context}` : capability || context || null,
    orderId: capability || null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: String(row.provider ?? '').trim() || '—',
    stateTone: 'neutral',
    // Rows whose rate we could not price are the ones that make a total a lie —
    // say so on the pill rather than quietly under-reporting the cost.
    stateTip:
      row.unknownRateCalls > 0
        ? `${row.unknownRateCalls} call(s) at an unknown rate — excluded from the cost`
        : undefined,
    delay: null,
    amount: formatAiUsageCost(row.costMicrocents),
    amountNote: `${Number(row.calls ?? 0).toLocaleString('en-US')} calls`,
  };
}
