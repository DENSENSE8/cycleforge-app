import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SearchHit } from '@/lib/search/search-hit';
import type { PhotoEvidence } from './photo-evidence';
import {
  buildSources,
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
function fakes(over: Partial<SuggestDeps> = {}) {
  const calls: Array<{ system: string; user: string; images?: string[] }> = [];
  const deps: SuggestDeps = {
    queryRag: async () => ({ answer: '', sources: [], chunks: [] }),
    generate: async (p) => {
      calls.push({ system: p.system, user: p.user, images: p.images });
      return 'Here is your draft.';
    },
    resolveModel: (usedImages) => (usedImages ? 'cloud-model' : 'local-model'),
    ...over,
  };
  return { deps, calls };
}

// ── the safety classification ───────────────────────────────────────────────

/**
 * The load-bearing test of this phase. `local-only` must never put an image URL
 * in front of a model, however many the route resolved — and the caller cannot
 * opt out by omission, because `vision` has no default.
 */
test('local-only NEVER sends an image, even when URLs were supplied', async () => {
  const { deps, calls } = fakes();
  const result = await suggestSupportReplyCore(
    {
      ticketId: 1,
      question: 'Is this covered?',
      vision: 'local-only',
      photos: [photo()],
      imageUrls: ['https://storage.example/signed/abc'],
    },
    deps,
  );
  assert.equal(calls[0].images, undefined);
  assert.equal(result.mode, 'local-only');
  assert.equal(result.model, 'local-model');
});

test('cloud-multimodal sends the signed URLs it was given', async () => {
  const { deps, calls } = fakes();
  const result = await suggestSupportReplyCore(
    {
      ticketId: 1,
      question: 'Is this covered?',
      vision: 'cloud-multimodal',
      photos: [photo()],
      imageUrls: ['https://storage.example/signed/abc'],
    },
    deps,
  );
  assert.deepEqual(calls[0].images, ['https://storage.example/signed/abc']);
  assert.equal(result.mode, 'cloud-multimodal');
  assert.equal(result.model, 'cloud-model');
});

/**
 * Asking for the cloud lane and sending nothing IS the local lane. Reporting
 * otherwise would tell the operator a customer's photo left the building.
 */
test('cloud lane with no resolvable URL reports the lane that actually ran', async () => {
  const { deps, calls } = fakes();
  const result = await suggestSupportReplyCore(
    { ticketId: 1, question: 'hi', vision: 'cloud-multimodal', photos: [photo()], imageUrls: [] },
    deps,
  );
  assert.equal(calls[0].images, undefined);
  assert.equal(result.mode, 'local-only');
});

// ── the deterministic evidence reaches the model ────────────────────────────

test('the prompt carries the image facts AND the matched row — on both lanes', async () => {
  const { deps, calls } = fakes();
  await suggestSupportReplyCore(
    { ticketId: 1, question: 'Is this covered?', vision: 'local-only', photos: [photo()] },
    deps,
  );
  assert.match(calls[0].user, /A dented amplifier/);
  assert.match(calls[0].user, /Visible damage: yes — dent on the faceplate/);
  assert.match(calls[0].user, /Matches our record: unit — Unit SN1234/);
});

test('a photo with no message still drafts — an image IS a question', async () => {
  const { deps } = fakes();
  const result = await suggestSupportReplyCore(
    { ticketId: 1, question: '   ', vision: 'local-only', photos: [photo()] },
    deps,
  );
  assert.equal(result.suggestion, 'Here is your draft.');
  // …and the thread contributed nothing, so it is not claimed as a source.
  assert.ok(!result.sources.some((s) => s.type === 'thread'));
});

test('neither a message nor a photo is a 400, not an empty draft', async () => {
  const { deps } = fakes();
  await assert.rejects(
    () => suggestSupportReplyCore({ ticketId: 1, question: '', vision: 'local-only' }, deps),
    (err: unknown) => err instanceof SupportSuggestError && err.status === 400,
  );
});

test('a RAG failure degrades to an ungrounded draft, never a failed request', async () => {
  const { deps } = fakes({
    queryRag: async () => {
      throw new Error('rag down');
    },
  });
  const result = await suggestSupportReplyCore(
    { ticketId: 1, question: 'Is this covered?', vision: 'local-only' },
    deps,
  );
  assert.equal(result.grounded, false);
  assert.equal(result.suggestion, 'Here is your draft.');
});

test('an empty generation is a 502, not a blank draft handed to an agent', async () => {
  const { deps } = fakes({ generate: async () => '   ' });
  await assert.rejects(
    () => suggestSupportReplyCore({ ticketId: 1, question: 'hi', vision: 'local-only' }, deps),
    (err: unknown) => err instanceof SupportSuggestError && err.status === 502,
  );
});

// ── confidence + typed sources ──────────────────────────────────────────────

/**
 * A photo whose identifiers matched NOTHING caps the draft at `low` however
 * well the docs answered: the assistant is talking about an object it could not
 * place, and a confident paragraph about an unplaced object is what reaches the
 * customer.
 */
test('an unmatched photo caps confidence at low', () => {
  assert.equal(
    resolveConfidence({
      grounded: true,
      ragTopScore: 0.9,
      photos: [photo({ matches: [] })],
      matchCount: 0,
    }),
    'low',
  );
});

test('a matched photo plus doc grounding is the strongest answer this loop makes', () => {
  assert.equal(
    resolveConfidence({ grounded: true, ragTopScore: 0.5, photos: [photo()], matchCount: 1 }),
    'high',
  );
  assert.equal(
    resolveConfidence({ grounded: false, ragTopScore: undefined, photos: [photo()], matchCount: 1 }),
    'medium',
  );
});

test('with no photos the doc score still decides', () => {
  assert.equal(
    resolveConfidence({ grounded: true, ragTopScore: 0.8, photos: [], matchCount: 0 }),
    'high',
  );
  assert.equal(
    resolveConfidence({ grounded: false, ragTopScore: 0.8, photos: [], matchCount: 0 }),
    'low',
  );
});

test('every source says WHICH KIND it is — a bare string could not', () => {
  const sources = buildSources({
    rag: { answer: 'a', sources: ['warranty.pdf'], chunks: [] },
    photos: [photo()],
    matches: [hit()],
    hasQuestion: true,
  });
  assert.deepEqual(sources, [
    { type: 'thread', label: 'Customer message' },
    { type: 'rag', label: 'warranty.pdf' },
    { type: 'ocr', label: 'SN1234' },
    { type: 'catalog', label: 'unit · Unit SN1234' },
  ]);
});
