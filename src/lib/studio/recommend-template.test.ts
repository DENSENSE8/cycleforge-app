/**
 * DB-free tests for recommendTemplates (Phase 5). Pure scoring + an injected
 * rerank hook. Asserts: relevant templates rank above irrelevant ones, a
 * category match wins, and a rerank can only reorder/subset known slugs (a
 * hallucinated slug is dropped).
 *   npx tsx --test src/lib/studio/recommend-template.test.ts
 */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendTemplates, type TemplateCandidate } from './recommend-template';

const CANDIDATES: TemplateCandidate[] = [
  {
    slug: 'electronics-av-refurb',
    name: 'Electronics AV Refurb',
    description: 'Receive, test, wipe data, and repair audio-video electronics before listing.',
    category: 'electronics',
    nodeTypes: ['receiving', 'inspection', 'data_wipe', 'repair', 'list'],
  },
  {
    slug: 'apparel-intake',
    name: 'Apparel Intake',
    description: 'Receive and photograph clothing, then list.',
    category: 'apparel',
    nodeTypes: ['receiving', 'list'],
  },
  {
    slug: 'general-receiving',
    name: 'General Receiving',
    description: 'A minimal receive-and-store flow.',
    category: null,
    nodeTypes: ['receiving'],
  },
];

test('ranks the relevant vertical above the irrelevant ones', async () => {
  const out = await recommendTemplates(
    { text: 'We refurbish and test used electronics, wipe data, then list them for resale.' },
    CANDIDATES,
  );
  assert.equal(out.recommendations[0].slug, 'electronics-av-refurb');
  assert.ok(out.recommendations[0].score > 0);
});

test('an exact category match wins and is explained', async () => {
  const out = await recommendTemplates(
    { text: 'general goods', category: 'apparel' },
    CANDIDATES,
  );
  assert.equal(out.recommendations[0].slug, 'apparel-intake');
  assert.match(out.recommendations[0].reason, /apparel/);
});

test('only returns existing slugs and respects the limit', async () => {
  const out = await recommendTemplates({ text: 'electronics' }, CANDIDATES, {}, 2);
  const slugs = new Set(CANDIDATES.map((c) => c.slug));
  assert.equal(out.recommendations.length, 2);
  for (const r of out.recommendations) assert.ok(slugs.has(r.slug));
});

test('a rerank hook can reorder but a hallucinated slug is dropped', async () => {
  const out = await recommendTemplates(
    { text: 'electronics' },
    CANDIDATES,
    {
      rerank: async () => [
        { slug: 'made-up-slug', score: 1, reason: 'hallucination' }, // must be dropped
        { slug: 'apparel-intake', score: 0.9, reason: 'model preferred' },
        { slug: 'apparel-intake', score: 0.9, reason: 'dupe' }, // de-duped
      ],
    },
  );
  assert.deepEqual(out.recommendations.map((r) => r.slug), ['apparel-intake']);
});

test('empty intake yields zero-score general starting points, still only known slugs', async () => {
  const out = await recommendTemplates({ text: 'xyzzy', category: null }, CANDIDATES);
  const slugs = new Set(CANDIDATES.map((c) => c.slug));
  for (const r of out.recommendations) assert.ok(slugs.has(r.slug));
});
