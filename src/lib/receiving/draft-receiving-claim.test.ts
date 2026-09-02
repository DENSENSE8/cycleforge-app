/**
 * Claim draft — template is LLM input, never the filed body unless Hermes degrades.
 *
 *   node --import tsx --test src/lib/receiving/draft-receiving-claim.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { draftReceivingClaimWithLlm } from './draft-receiving-claim';
import type { ClaimTemplateResult } from '@/lib/zendesk-claim-template';

const TEMPLATE: ClaimTemplateResult = {
  subject: 'Damage // PO 01-1 // TRK#1Z999',
  description: 'Purchase Order: 01-1\nTracking: 1Z999\nItem: Bose QC',
  poNumber: '01-1',
  tracking: '1Z999',
};

test('Hermes rewrite is the draft when facts survive', async () => {
  const result = await draftReceivingClaimWithLlm(
    'org_test' as never,
    { receivingId: 1, claimType: 'damage' },
    {
      buildTemplate: async () => TEMPLATE,
      draftWithLlm: async () => ({
        subject: 'Damage on PO 01-1 — TRK#1Z999',
        description: 'We received Bose QC on PO 01-1 / 1Z999 with damage.',
        model: 'hermes',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
      }),
    },
  );
  assert.equal(result.degraded, false);
  assert.match(result.description, /Bose QC/);
  assert.equal(result.template.poNumber, '01-1');
});

test('dropped PO or tracking falls back to the factual template', async () => {
  const result = await draftReceivingClaimWithLlm(
    'org_test' as never,
    { receivingId: 1, claimType: 'damage' },
    {
      buildTemplate: async () => TEMPLATE,
      draftWithLlm: async () => ({
        subject: 'Something broke',
        description: 'Please advise.',
        model: 'hermes',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
      }),
    },
  );
  assert.equal(result.degraded, true);
  assert.equal(result.subject, TEMPLATE.subject);
  assert.equal(result.description, TEMPLATE.description);
});

test('Hermes throw still returns the factual template so filing is not blocked', async () => {
  const result = await draftReceivingClaimWithLlm(
    'org_test' as never,
    { receivingId: 1, claimType: 'unfound', reason: 'no PO on box' },
    {
      buildTemplate: async () => TEMPLATE,
      draftWithLlm: async () => {
        throw new Error('gateway down');
      },
    },
  );
  assert.equal(result.degraded, true);
  assert.equal(result.description, TEMPLATE.description);
});
