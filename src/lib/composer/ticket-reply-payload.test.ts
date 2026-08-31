/**
 * The one reply payload both composers send — REQ-SEND-01/02/03, REQ-CC-03/04.
 *
 *   node --import tsx --test src/lib/composer/ticket-reply-payload.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComposerReplyVars,
  signComposerInternalNote,
} from './ticket-reply-payload';

test('REQ-SEND-01: an internal note is signed with the staffer; a public reply is not', () => {
  assert.equal(
    signComposerInternalNote('Box arrived crushed', { isPublic: false, staffName: 'Mel' }),
    'Box arrived crushed\n\n— Mel',
  );
  assert.equal(
    signComposerInternalNote('Box arrived crushed', { isPublic: true, staffName: 'Mel' }),
    'Box arrived crushed',
  );
  // No signed-in name to attribute to — nothing is appended.
  assert.equal(
    signComposerInternalNote('Box arrived crushed', { isPublic: false, staffName: '' }),
    'Box arrived crushed',
  );
});

test('signing is idempotent — inserting a fact after signing does not double it', () => {
  const once = signComposerInternalNote('Note', { isPublic: false, staffName: 'Mel' });
  assert.equal(signComposerInternalNote(once, { isPublic: false, staffName: 'Mel' }), once);
});

test('REQ-SEND-01: the internal payload is private, signed and CC-free', () => {
  const vars = buildComposerReplyVars({
    ticketId: 42,
    body: '  Repacked it  ',
    isPublic: false,
    staffName: 'Mel',
    ccs: ['a@b.co'],
    ccDraft: 'c@d.co',
  });
  assert.ok(vars);
  assert.equal(vars.ticketId, 42);
  assert.equal(vars.isPublic, false);
  assert.equal(vars.body, 'Repacked it\n\n— Mel');
  assert.equal('emailCcs' in vars, false, 'REQ-CC-04 — internal notes are never emailed');
  assert.match(vars.htmlBody ?? '', /Repacked it/);
});

test('REQ-SEND-02 / REQ-CC-03: the public payload carries chips + the pending address', () => {
  const vars = buildComposerReplyVars({
    ticketId: 42,
    body: 'Replacement is on the way',
    isPublic: true,
    staffName: 'Mel',
    ccs: ['a@b.co'],
    ccDraft: 'c@d.co',
  });
  assert.ok(vars);
  assert.equal(vars.isPublic, true);
  assert.equal(vars.body, 'Replacement is on the way', 'public replies are unsigned');
  assert.deepEqual(vars.emailCcs, ['a@b.co', 'c@d.co']);
});

test('REQ-SEND-03: staged photos ride along as photoIds + optimistic previews', () => {
  const vars = buildComposerReplyVars({
    ticketId: 7,
    body: 'See photo',
    isPublic: true,
    photoIds: [11, 12],
    attachmentPreviews: [{ url: 'u1', thumbUrl: 't1' }, { url: 'u2' }],
  });
  assert.ok(vars);
  assert.deepEqual(vars.photoIds, [11, 12]);
  assert.deepEqual(vars.attachmentPreviews, [
    { url: 'u1', thumbUrl: 't1' },
    { url: 'u2', thumbUrl: undefined },
  ]);
});

test('nothing staged and nothing CCed leaves those keys off the request entirely', () => {
  const vars = buildComposerReplyVars({ ticketId: 7, body: 'Just text', isPublic: true });
  assert.ok(vars);
  assert.equal('photoIds' in vars, false);
  assert.equal('attachmentPreviews' in vars, false);
  assert.equal('emailCcs' in vars, false);
});

test('an empty draft builds nothing — the caller uses null as its send guard', () => {
  assert.equal(buildComposerReplyVars({ ticketId: 7, body: '   ', isPublic: false }), null);
});
