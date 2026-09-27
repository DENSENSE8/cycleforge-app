/**
 * DB-free tests for assistant pre-loop preparation.
 * Run: npx tsx --test src/lib/assistant/enrich-turn.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichAssistantTurn, type EnrichTurnDeps } from './enrich-turn';

const ORG = '11111111-2222-3333-4444-555555555555';

test('enrichAssistantTurn: local_ops answers without a model', async () => {
  const deps: EnrichTurnDeps = {
    resolveLocal: async (msg, orgId) => {
      assert.equal(orgId, ORG);
      assert.match(msg, /shipped/i);
      return {
        mode: 'local_ops',
        reply: '42 shipped this week',
        analysis: {
          mode: 'local_ops',
          modeLabel: 'Local ops',
          title: 'Shipping',
          summary: '42',
          kind: 'shipping_summary',
        } as never,
      };
    },
  };
  const out = await enrichAssistantTurn(ORG, 'how many shipped this week', deps);
  assert.equal(out.kind, 'local_ops');
  if (out.kind === 'local_ops') assert.equal(out.resolution.reply, '42 shipped this week');
});

test('enrichAssistantTurn: an ordinary question reaches the model as typed — the tools fetch its data', async () => {
  const out = await enrichAssistantTurn(ORG, '  find order 12345 ', { resolveLocal: async () => null });
  assert.deepEqual(out, { kind: 'enriched', userMessage: 'find order 12345' });
});
