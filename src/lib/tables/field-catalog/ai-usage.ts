/**
 * AI-usage field catalog — the bindable facts of one model roll-up row.
 *
 * Off `AdminTable` 2026-09-05. Estimated cost is line money under the model
 * title (same face as To-ship / Unbox), not an Amount column. The field id
 * stays `ai-usage.cost` so last-cost analytics (`catalog.cost`) is not treated
 * as a priced line; the adapter paints it with `lineMoneySubtitlePart`.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const AIUSAGE_FIELD_CATALOG: FieldCatalog = [
  { id: 'ai-usage.use', family: 'ai-usage', label: 'Use', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'capability', context: 'context' } },
  { id: 'ai-usage.provider', family: 'ai-usage', label: 'Provider', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'provider' } },
  { id: 'ai-usage.model', family: 'ai-usage', label: 'Model', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'model' } },
  { id: 'ai-usage.calls', family: 'ai-usage', label: 'Calls', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'calls' } },
  { id: 'ai-usage.tokens_in', family: 'ai-usage', label: 'Tokens in', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'inputTokens' } },
  { id: 'ai-usage.tokens_out', family: 'ai-usage', label: 'Tokens out', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'outputTokens' } },
  { id: 'ai-usage.cost', family: 'ai-usage', label: 'Est. cost', displayType: 'money', slotKinds: ['subtitle'], paths: { value: 'costMicrocents' } },
];

/** `model` is the row TITLE and `provider` the state pill — neither is a track. */
export const AIUSAGE_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'ai-usage.use',
  statusBindings: [
    { fieldId: 'ai-usage.calls' },
    { fieldId: 'ai-usage.tokens_in' },
    { fieldId: 'ai-usage.tokens_out' },
  ],
  subtitleBindings: [{ fieldId: 'ai-usage.cost' }],
  amountFieldId: null,
};

export const AIUSAGE_TABLE_LAYOUT_ID = 'ai-usage';
