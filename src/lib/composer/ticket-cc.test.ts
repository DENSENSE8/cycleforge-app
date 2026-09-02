/**
 * CC (audience) rules — REQ-CC-01/02/03/04.
 *
 *   node --import tsx --test src/lib/composer/ticket-cc.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addComposerCc,
  buildComposerCcSuggestions,
  COMPOSER_CC_HISTORY_STORAGE_KEY,
  isComposerCcEmail,
  normalizeComposerCc,
  readComposerCcHistory,
  rememberComposerCcHistory,
  removeComposerCc,
  resolveComposerCcPayload,
  type ComposerCcStorage,
} from './ticket-cc';

test('REQ-CC-01: a valid address is added once; junk and duplicates are refused', () => {
  assert.deepEqual(addComposerCc([], 'a@b.co'), ['a@b.co']);
  // The separator an operator types between two addresses is not part of one.
  assert.deepEqual(addComposerCc([], ' a@b.co, '), ['a@b.co']);
  assert.deepEqual(addComposerCc(['a@b.co'], 'a@b.co'), ['a@b.co']);
  assert.deepEqual(addComposerCc(['a@b.co'], 'not-an-email'), ['a@b.co']);
  assert.deepEqual(addComposerCc(['a@b.co'], '   '), ['a@b.co']);
});

test('REQ-CC-02: removing a chip drops exactly that address', () => {
  assert.deepEqual(removeComposerCc(['a@b.co', 'c@d.co'], 'a@b.co'), ['c@d.co']);
  assert.deepEqual(removeComposerCc(['a@b.co'], 'missing@x.co'), ['a@b.co']);
});

test('normalize / validate agree on what counts as an address', () => {
  assert.equal(normalizeComposerCc('  x@y.com;'), 'x@y.com');
  assert.equal(isComposerCcEmail('x@y.com'), true);
  assert.equal(isComposerCcEmail('x@y'), false);
  assert.equal(isComposerCcEmail('x y@z.com'), false);
});

test('REQ-CC-03: a public send carries the chips AND the half-typed address', () => {
  assert.deepEqual(
    resolveComposerCcPayload({ isPublic: true, ccs: ['a@b.co'], draft: 'c@d.co' }),
    ['a@b.co', 'c@d.co'],
  );
  // Junk still in the field is dropped rather than sent.
  assert.deepEqual(
    resolveComposerCcPayload({ isPublic: true, ccs: ['a@b.co'], draft: 'half-typed' }),
    ['a@b.co'],
  );
});

test('REQ-CC-04: an internal note never carries CCs — undefined, not []', () => {
  assert.equal(
    resolveComposerCcPayload({ isPublic: false, ccs: ['a@b.co'], draft: 'c@d.co' }),
    undefined,
  );
  // Public with nothing to send is also undefined: `emailCcs: []` and "no CCs"
  // must reach Zendesk as the same request.
  assert.equal(resolveComposerCcPayload({ isPublic: true, ccs: [], draft: '' }), undefined);
});

test('suggestions = requester + agents, minus what is already attached', () => {
  assert.deepEqual(
    buildComposerCcSuggestions({
      requesterEmail: 'buyer@shop.com',
      agentEmails: ['agent@co.com', null, undefined, 'agent@co.com'],
      ccs: [],
    }),
    ['buyer@shop.com', 'agent@co.com'],
  );
  assert.deepEqual(
    buildComposerCcSuggestions({
      requesterEmail: 'buyer@shop.com',
      agentEmails: ['agent@co.com'],
      ccs: ['buyer@shop.com'],
    }),
    ['agent@co.com'],
  );
});

function memStore(init: Record<string, string> = {}): ComposerCcStorage & {
  data: Record<string, string>;
} {
  const data = { ...init };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

test('REQ-CC-05: composer and rail read the same accumulated public-CC bank', () => {
  const store = memStore({
    [COMPOSER_CC_HISTORY_STORAGE_KEY]: JSON.stringify(['vendor@co.com', 'ops@co.com']),
  });
  assert.deepEqual(readComposerCcHistory(store), ['vendor@co.com', 'ops@co.com']);

  const legacy = memStore({ [COMPOSER_CC_HISTORY_STORAGE_KEY]: 'old@co.com' });
  assert.deepEqual(readComposerCcHistory(legacy), ['old@co.com']);

  assert.deepEqual(readComposerCcHistory(memStore()), []);
});

test('REQ-CC-06: new chips accumulate; clearing the form does not wipe history', () => {
  const store = memStore({
    [COMPOSER_CC_HISTORY_STORAGE_KEY]: JSON.stringify(['vendor@co.com']),
  });
  assert.deepEqual(rememberComposerCcHistory(['ops@co.com'], store), [
    'vendor@co.com',
    'ops@co.com',
  ]);
  assert.deepEqual(rememberComposerCcHistory([], store), ['vendor@co.com', 'ops@co.com']);
  assert.deepEqual(readComposerCcHistory(store), ['vendor@co.com', 'ops@co.com']);
});

