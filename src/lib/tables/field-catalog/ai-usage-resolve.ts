/**
 * AI-usage slot resolvers — pure.
 *
 * Counts resolve as plain integers with thousands separators: a token count is
 * read for its MAGNITUDE, and `1843201` is harder to size at a glance than
 * `1,843,201`. Cost is formatted here rather than in the adapter because it is a
 * bound FACT (under the title today), and a fact must read the same wherever
 * it is bound.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { AiUsageTableRow } from '@/lib/ai/ai-usage-row';

function count(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Number(n).toLocaleString('en-US');
}

/** Microcents → dollars. Sub-cent totals still read as a real figure. */
export function formatAiUsageCost(microcents: number | null | undefined): string | null {
  if (microcents == null || !Number.isFinite(microcents)) return null;
  const dollars = Number(microcents) / 100_000_000;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: dollars > 0 && dollars < 0.01 ? 4 : 2,
    maximumFractionDigits: 4,
  });
}

export function resolveAiUsageSlotValue(
  row: AiUsageTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'ai-usage.use': {
      const cap = String(row.capability ?? '').trim();
      const ctx = String(row.context ?? '').trim();
      return { kind: 'value', text: cap && ctx ? `${cap} · ${ctx}` : cap || ctx || null };
    }
    case 'ai-usage.provider':
      return { kind: 'value', text: String(row.provider ?? '').trim() || null };
    case 'ai-usage.model':
      return { kind: 'value', text: String(row.model ?? '').trim() || null };
    case 'ai-usage.calls':
      return { kind: 'value', text: count(row.calls) };
    case 'ai-usage.tokens_in':
      return { kind: 'value', text: count(row.inputTokens) };
    case 'ai-usage.tokens_out':
      return { kind: 'value', text: count(row.outputTokens) };
    case 'ai-usage.cost':
      return { kind: 'value', text: formatAiUsageCost(row.costMicrocents) };
    default:
      return null;
  }
}
