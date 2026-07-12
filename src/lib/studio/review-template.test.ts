/**
 * DB-free tests for reviewSubmittedTemplate (Phase 4). The guarded UPDATE is
 * injected, so we assert the decision→(review_status, visibility) mapping and
 * that a no-op update (already reviewed / not found) 409s.
 *   npx tsx --test src/lib/studio/review-template.test.ts
 */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewSubmittedTemplate, type ReviewTemplateDeps } from './review-template';

function fakes(row: { name: string; slug: string } | null = { name: 'Peer Flow', slug: 'peer-flow' }) {
  const cap = {
    applied: [] as Array<{ id: number; next: { reviewStatus: string; visibility: string } }>,
  };
  const deps: ReviewTemplateDeps = {
    applyReview: async (templateId, next) => {
      cap.applied.push({ id: templateId, next });
      return row;
    },
  };
  return { deps, cap };
}

test('approve → approved / public', async () => {
  const { deps, cap } = fakes();
  const out = await reviewSubmittedTemplate({ templateId: 5, decision: 'approve' }, deps);
  assert.deepEqual(cap.applied[0].next, { reviewStatus: 'approved', visibility: 'public' });
  assert.equal(out.status, 200);
  assert.equal(out.reviewed, true);
  assert.equal(out.reviewStatus, 'approved');
  assert.equal(out.visibility, 'public');
  assert.equal(out.slug, 'peer-flow');
});

test('reject → rejected / private', async () => {
  const { deps, cap } = fakes();
  const out = await reviewSubmittedTemplate({ templateId: 5, decision: 'reject' }, deps);
  assert.deepEqual(cap.applied[0].next, { reviewStatus: 'rejected', visibility: 'private' });
  assert.equal(out.status, 200);
  assert.equal(out.reviewStatus, 'rejected');
  assert.equal(out.visibility, 'private');
});

test('a no-op update (already reviewed / not found) 409s', async () => {
  const { deps } = fakes(null);
  const out = await reviewSubmittedTemplate({ templateId: 5, decision: 'approve' }, deps);
  assert.equal(out.status, 409);
  assert.equal(out.reviewed, false);
  assert.equal(out.reviewStatus, null);
});
