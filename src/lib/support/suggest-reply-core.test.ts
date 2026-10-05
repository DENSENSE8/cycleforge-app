import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMarketplacePolicy } from '@/lib/support/conversation/marketplace-policy';
import type { SearchHit } from '@/lib/search/search-hit';
import { draftContext, draftMessage } from './drafts/fixtures';
import type { PhotoEvidence } from './photo-evidence';
import {
  resolveConfidence,
  suggestSupportReplyCore,
  SupportSuggestError,
  type SuggestDeps,
} from './suggest-reply-core';

function hit(over: Partial<SearchHit> = {}): SearchHit {
  return {
    id: 1,
    entityType: 'unit',
    title: 'Unit SN1234',
    subtitle: 'Shipped on order 99',
    href: '/u/1',
    matchField: 'serial',
    score: 1,
    chips: [],
    ...over,
  } as SearchHit;
}

function photo(over: Partial<PhotoEvidence> = {}): PhotoEvidence {
  return {
    photoId: 7,
    caption: 'A dented amplifier',
    labels: ['amplifier'],
    ocrText: ['SN1234'],
    damageDetected: true,
    damageNotes: 'dent on the faceplate',
    decoded: [{ raw: 'SN1234', value: 'SN1234', type: 'serial-unit', matched: true }],
    matches: [hit()],
    ...over,
  };
}

/** Captures what the model was actually handed. Zero network. */
function fakes(over: Partial<SuggestDeps> = {}, reply = 'It is in final testing and has not left us yet.') {
  const calls: Array<{ system: string; user: string; images?: string[]; sessionTag: string }> = [];
  const deps: SuggestDeps = {
    queryRag: async () => ({ answer: '', sources: [], chunks: [] }),
    searchRecords: async () => [],
    generate: async (p) => {
      calls.push({ system: p.system, user: p.user, images: p.images, sessionTag: p.sessionTag });
      return { text: reply, model: p.images?.length ? 'cloud-model' : 'local-model' };
    },
    applyChannelPolicy: applyMarketplacePolicy,
    ...over,
  };
  return { deps, calls };
}

// ── the safety classification ───────────────────────────────────────────────

test('local-only NEVER sends an image, even when URLs were supplied', async () => {
  const { deps, calls } = fakes();
  const result = await suggestSupportReplyCore(
    { context: draftContext({ photos: [photo()] }), kind: 'reply', vision: 'local-only', imageUrls: ['https://signed/1.jpg'] },
    deps,
  );
  assert.equal(calls[0].images, undefined);
  assert.equal(result.mode, 'local-only');
  assert.equal(result.model, 'local-model');
  // The model still reasons over the deterministic image facts.
  assert.match(calls[0].user, /Text read: SN1234/);
});

test('cloud-multimodal sends the signed URLs and reports the lane that ran', async () => {
  const { deps, calls } = fakes();
  const result = await suggestSupportReplyCore(
    { context: draftContext({ photos: [photo()] }), kind: 'reply', vision: 'cloud-multimodal', imageUrls: ['https://signed/1.jpg'] },
    deps,
  );
  assert.deepEqual(calls[0].images, ['https://signed/1.jpg']);
  assert.equal(result.mode, 'cloud-multimodal');
  assert.equal(result.model, 'cloud-model');
});

test('asking for the cloud lane with no URL is the local lane — reported honestly', async () => {
  const { deps } = fakes();
  const result = await suggestSupportReplyCore(
    { context: draftContext({ photos: [photo()] }), kind: 'reply', vision: 'cloud-multimodal', imageUrls: [] },
    deps,
  );
  assert.equal(result.mode, 'local-only');
});

// ── grounding, local context, failure modes ────────────────────────────────

test('no provider ticket id reaches the model: the session is keyed by the local item', async () => {
  const { deps, calls } = fakes();
  await suggestSupportReplyCore({ context: draftContext(), kind: 'reply', vision: 'local-only' }, deps);
  assert.equal(calls[0].sessionTag, 'support-item-77');
});

test('a RAG outage still drafts from the linked local records', async () => {
  const { deps } = fakes({
    queryRag: async () => {
      throw new Error('NemoClaw down');
    },
    searchRecords: async () => {
      throw new Error('search down');
    },
  });
  const result = await suggestSupportReplyCore({ context: draftContext(), kind: 'reply', vision: 'local-only' }, deps);
  assert.equal(result.grounded, false);
  assert.equal(result.confidence, 'medium');
  assert.ok(result.sources.some((s) => s.type === 'order' && s.ref === 'orders:501'));
});

test('a reply with nothing to answer is a 400', async () => {
  const { deps } = fakes();
  await assert.rejects(
    () => suggestSupportReplyCore({ context: draftContext({ messages: [] }), kind: 'reply', vision: 'local-only' }, deps),
    (err: unknown) => err instanceof SupportSuggestError && err.status === 400,
  );
});

test('an empty or signature-only generation is a 502, not a blank draft', async () => {
  for (const reply of ['   ', 'Best regards,\nMike']) {
    const { deps } = fakes({}, reply);
    await assert.rejects(
      () => suggestSupportReplyCore({ context: draftContext(), kind: 'reply', vision: 'local-only' }, deps),
      (err: unknown) => err instanceof SupportSuggestError && err.status === 502,
    );
  }
});

// ── validators + policy applied before the draft is returned ───────────────

test('validators run on the generation: a wrong weekday and an unproven shipment lower confidence to low', async () => {
  const { deps } = fakes({}, 'Your order has shipped and arrives Monday, October 6.');
  const result = await suggestSupportReplyCore({ context: draftContext(), kind: 'reply', vision: 'local-only' }, deps);
  assert.equal(result.confidence, 'low');
  assert.match(result.warnings.join(' '), /Tuesday, not a Monday/);
  assert.match(result.warnings.join(' '), /Says the item shipped/);
});

test('marketplace policy is applied to the stored body: an eBay draft never carries a link', async () => {
  const { deps } = fakes({}, 'The manual is at https://example.com/amp.pdf if you need it.\n\nBest regards,\nMike');
  const result = await suggestSupportReplyCore({ context: draftContext(), kind: 'reply', vision: 'local-only' }, deps);
  assert.doesNotMatch(result.suggestion, /https?:|Best regards/);
  assert.ok(result.warnings.includes('Removed links (marketplace policy).'));
});

test('the same link survives on an email conversation', async () => {
  const { deps } = fakes({}, 'The manual is at https://example.com/amp.pdf if you need it.');
  const result = await suggestSupportReplyCore(
    { context: draftContext({ item: { channel: 'email' } }), kind: 'reply', vision: 'local-only' },
    deps,
  );
  assert.match(result.suggestion, /https:\/\/example\.com\/amp\.pdf/);
});

test('a staff-logged case (no inbound) still drafts from the log', async () => {
  const { deps, calls } = fakes({}, 'We have your amplifier on the bench and will update you Monday, October 5.');
  await suggestSupportReplyCore(
    {
      context: draftContext({ messages: [draftMessage({ direction: 'internal', body: 'Customer called about a hum.' })] }),
      kind: 'reply',
      vision: 'local-only',
    },
    deps,
  );
  assert.match(calls[0].user, /case was logged by our staff/);
});

// ── confidence ─────────────────────────────────────────────────────────────

test('an unmatched photo caps confidence at low', () => {
  assert.equal(resolveConfidence({ grounded: true, ragTopScore: 0.9, localFacts: 1, photos: [photo({ matches: [] })], matchCount: 0 }), 'low');
});

test('a matched photo plus grounding is the strongest answer this loop makes', () => {
  assert.equal(resolveConfidence({ grounded: true, ragTopScore: 0.5, localFacts: 0, photos: [photo()], matchCount: 1 }), 'high');
  assert.equal(resolveConfidence({ grounded: false, ragTopScore: undefined, localFacts: 0, photos: [photo()], matchCount: 1 }), 'medium');
});

test('with no photos: doc score decides; linked records lift an ungrounded draft to medium', () => {
  assert.equal(resolveConfidence({ grounded: true, ragTopScore: 0.8, localFacts: 0, photos: [], matchCount: 0 }), 'high');
  assert.equal(resolveConfidence({ grounded: false, ragTopScore: 0.8, localFacts: 0, photos: [], matchCount: 0 }), 'low');
  assert.equal(resolveConfidence({ grounded: false, ragTopScore: undefined, localFacts: 2, photos: [], matchCount: 0 }), 'medium');
});
