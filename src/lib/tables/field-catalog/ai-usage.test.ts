/**
 * AI-usage catalog — cost is under the title, not an Amount track.
 *
 * Run: node --import tsx --test src/lib/tables/field-catalog/ai-usage.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aiUsageCompoundView } from '@/lib/ai/ai-usage-row-adapter';
import type { AiUsageTableRow } from '@/lib/ai/ai-usage-row';
import { COMPOUND_MONEY_TONE_CLASS } from '@/components/tables/compound/compound-row-model';
import { AIUSAGE_FIELD_CATALOG, AIUSAGE_PRODUCT_LAYOUT } from './ai-usage';
import { parseSlotLayout } from '../slot-layout';
import { resolveEffectiveLayout } from '../resolve-effective-layout';

function row(over: Partial<AiUsageTableRow> = {}): AiUsageTableRow {
  return {
    key: 'ask:openai:gpt-4o:desk',
    capability: 'ask',
    provider: 'openai',
    model: 'gpt-4o',
    context: 'desk',
    calls: 12,
    inputTokens: 1000,
    outputTokens: 200,
    costMicrocents: 15_000_000,
    unknownRateCalls: 0,
    ...over,
  };
}

describe('AIUSAGE_PRODUCT_LAYOUT', () => {
  it('parses against the catalog', () => {
    const parsed = parseSlotLayout(AIUSAGE_PRODUCT_LAYOUT, AIUSAGE_FIELD_CATALOG);
    assert.equal(parsed.amountFieldId, null);
    assert.deepEqual(
      parsed.subtitleBindings.map((b) => b.fieldId),
      ['ai-usage.cost'],
    );
  });

  it('keeps estimated cost under the title after resolve', () => {
    const resolved = resolveEffectiveLayout({
      productDefault: AIUSAGE_PRODUCT_LAYOUT,
      catalog: AIUSAGE_FIELD_CATALOG,
    });
    assert.equal(resolved.amountFieldId, null);
    assert.equal(resolved.subtitleBindings[0]?.fieldId, 'ai-usage.cost');
  });
});

describe('aiUsageCompoundView', () => {
  it('does not dual-write cost onto view.amount', () => {
    const view = aiUsageCompoundView(row());
    assert.equal(view.amount, null);
    assert.equal(view.subtitleParts?.[0]?.key, 'ai-usage.cost');
    assert.equal(view.subtitleParts?.[0]?.toneClass, COMPOUND_MONEY_TONE_CLASS);
  });
});
