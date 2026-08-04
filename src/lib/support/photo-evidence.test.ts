import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PhotoAnalysisMetadata } from '@/lib/photos/analyze-types';
import type { SearchHit } from '@/lib/search/search-hit';
import {
  collectPhotoEvidence,
  extractEvidenceTokens,
  flattenEvidenceMatches,
  renderEvidenceForPrompt,
  type PhotoEvidenceDeps,
} from './photo-evidence';

function metadata(over: Partial<PhotoAnalysisMetadata> = {}): PhotoAnalysisMetadata {
  return {
    ocr_text: [],
    labels: [],
    damage_detected: false,
    damage_notes: null,
    caption: 'A photo',
    ...over,
  };
}

function hit(over: Partial<SearchHit> = {}): SearchHit {
  return {
    id: 1,
    entityType: 'unit',
    title: 'Unit SN1234',
    subtitle: 'In stock',
    href: '/u/1',
    matchField: 'serial',
    score: 1,
    chips: [],
    ...over,
  } as SearchHit;
}

/** Records every call so a test can assert on what was decoded and searched. */
function fakes(over: Partial<PhotoEvidenceDeps> = {}) {
  const searched: string[] = [];
  const deps: PhotoEvidenceDeps = {
    analyze: async () => metadata(),
    decode: () => null,
    search: async (q) => {
      searched.push(q);
      return [];
    },
    ...over,
  };
  return { deps, searched };
}

// ── token extraction ────────────────────────────────────────────────────────

test('an identifier carries digits; prose does not', () => {
  const tokens = extractEvidenceTokens(['Fragile handle with care', 'SERIAL SN12345678']);
  assert.ok(tokens.includes('SN12345678'));
  assert.ok(!tokens.some((t) => t.toLowerCase() === 'fragile'));
  assert.ok(!tokens.includes('SERIAL'));
});

test('a URL stays ONE token — the decoder reads it whole', () => {
  const url = 'https://usav.app.cycleforge.ai/m/r/50354';
  const tokens = extractEvidenceTokens([url]);
  assert.ok(tokens.includes(url));
  // Never split into fragments the decoder cannot recognise.
  assert.ok(!tokens.some((t) => t === 'https:' || t === 'usav.app.cycleforge.ai'));
});

test('short and duplicate tokens are dropped', () => {
  const tokens = extractEvidenceTokens(['2 of 3', 'R-1234', 'r-1234']);
  assert.deepEqual(tokens, ['R-1234']);
});

test('token count is capped per photo — a carrier label is mostly boilerplate', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `TOKEN${1000 + i}`);
  assert.equal(extractEvidenceTokens(lines).length, 12);
});

// ── decode → search ─────────────────────────────────────────────────────────

test('routeScan NORMALIZES before the search — a printed URL searches as its handle', async () => {
  const { deps, searched } = fakes({
    analyze: async () => metadata({ ocr_text: ['https://usav.app.cycleforge.ai/m/r/50354'] }),
    decode: () => ({ type: 'receiving', value: '50354' }),
  });
  await collectPhotoEvidence([7], deps);
  assert.deepEqual(searched, ['50354']);
});

test('a token the decoder does not recognise is still searched, raw', async () => {
  const { deps, searched } = fakes({
    analyze: async () => metadata({ ocr_text: ['1Z999AA10123456784'] }),
  });
  await collectPhotoEvidence([7], deps);
  assert.deepEqual(searched, ['1Z999AA10123456784']);
});

test('a decode that matches NOTHING is never fabricated into a hit', async () => {
  const { deps } = fakes({
    analyze: async () => metadata({ ocr_text: ['R-1234'] }),
    decode: () => ({ type: 'receiving', value: '1234' }),
  });
  const [photo] = await collectPhotoEvidence([7], deps);
  assert.equal(photo.matches.length, 0);
  assert.deepEqual(photo.decoded, [
    { raw: 'R-1234', value: '1234', type: 'receiving', matched: false },
  ]);
});

test('the same row matched by two tokens appears once', async () => {
  const { deps } = fakes({
    analyze: async () => metadata({ ocr_text: ['SN12345678', 'ORD-99123'] }),
    search: async () => [hit()],
  });
  const [photo] = await collectPhotoEvidence([7], deps);
  assert.equal(photo.matches.length, 1);
});

test('a failing search degrades to no matches, never to a thrown request', async () => {
  const { deps } = fakes({
    analyze: async () => metadata({ ocr_text: ['SN12345678'] }),
    search: async () => {
      throw new Error('search down');
    },
  });
  const [photo] = await collectPhotoEvidence([7], deps);
  assert.equal(photo.matches.length, 0);
  assert.equal(photo.decoded.length, 1);
});

test('a photo that cannot be analysed is still evidence, with empty facts', async () => {
  const { deps } = fakes({
    analyze: async () => {
      throw new Error('vision box unreachable');
    },
  });
  const evidence = await collectPhotoEvidence([7, 8], deps);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].caption, null);
  assert.equal(evidence[0].matches.length, 0);
});

test('image facts survive verbatim', async () => {
  const { deps } = fakes({
    analyze: async () =>
      metadata({
        caption: 'A dented amplifier',
        labels: ['amplifier', 'damage'],
        damage_detected: true,
        damage_notes: 'dent on the faceplate',
      }),
  });
  const [photo] = await collectPhotoEvidence([7], deps);
  assert.equal(photo.caption, 'A dented amplifier');
  assert.equal(photo.damageDetected, true);
  assert.equal(photo.damageNotes, 'dent on the faceplate');
  assert.deepEqual(photo.labels, ['amplifier', 'damage']);
});

// ── aggregation + prompt ────────────────────────────────────────────────────

test('flatten de-duplicates across photos', () => {
  const shared = hit();
  const flattened = flattenEvidenceMatches([
    { photoId: 1, caption: null, labels: [], ocrText: [], damageDetected: false, damageNotes: null, decoded: [], matches: [shared] },
    { photoId: 2, caption: null, labels: [], ocrText: [], damageDetected: false, damageNotes: null, decoded: [], matches: [shared, hit({ id: 2 })] },
  ]);
  assert.equal(flattened.length, 2);
});

test('the prompt block SAYS SO when nothing matched — silence would read as recognition', () => {
  const block = renderEvidenceForPrompt([
    {
      photoId: 1,
      caption: 'A serial label',
      labels: [],
      ocrText: ['SN12345678'],
      damageDetected: false,
      damageNotes: null,
      decoded: [{ raw: 'SN12345678', value: 'SN12345678', type: 'serial-unit', matched: false }],
      matches: [],
    },
  ]);
  assert.match(block, /No record in our system matched/);
});

test('no photos ⇒ no image block at all', () => {
  assert.equal(renderEvidenceForPrompt([]), '');
});
