import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStaffAuthor,
  isAppFiledOpener,
  staffNameFromNoteSignature,
} from './comment-staff-identity';

test('applyStaffAuthor prefers a recorded app post over Zendesk email', () => {
  const byComment = new Map([[10, { staffId: 7, name: 'Kai' }]]);
  const byEmail = new Map([['bot@zendesk.example', { staffId: 1, name: 'API Bot' }]]);
  const next = applyStaffAuthor(
    {
      id: 10,
      author_email: 'bot@zendesk.example',
      author_name: 'Zendesk Agent',
      author_photo: 'https://zendesk.example/a.png',
    },
    byComment,
    byEmail,
  );
  assert.equal(next.author_staff_id, 7);
  assert.equal(next.author_name, 'Kai');
  assert.equal(next.author_photo, null);
});

test('applyStaffAuthor falls back to staff.email when the comment was typed in Zendesk', () => {
  const next = applyStaffAuthor(
    {
      id: 11,
      author_email: 'kai@cycleforge.example',
      author_name: 'Kai From Zendesk',
      author_photo: 'https://zendesk.example/k.png',
    },
    new Map(),
    new Map([['kai@cycleforge.example', { staffId: 7, name: 'Kai' }]]),
  );
  assert.equal(next.author_staff_id, 7);
  assert.equal(next.author_name, 'Kai');
});

test('applyStaffAuthor leaves Zendesk identity when no staff maps', () => {
  const src = {
    id: 12,
    author_email: 'customer@buyer.example',
    author_name: 'Buyer',
    author_photo: 'https://zendesk.example/c.png',
  };
  const next = applyStaffAuthor(src, new Map(), new Map());
  assert.equal(next.author_staff_id, undefined);
  assert.equal(next.author_name, 'Buyer');
  assert.equal(next.author_photo, 'https://zendesk.example/c.png');
});

test('staffNameFromNoteSignature reads the app internal-note sign-off', () => {
  assert.equal(staffNameFromNoteSignature('Box crushed\n\n— Mel'), 'Mel');
  assert.equal(staffNameFromNoteSignature('No signature'), null);
});

test('isAppFiledOpener treats the Zendesk API agent-as-requester as ours', () => {
  const agents = new Set([9001]);
  assert.equal(
    isAppFiledOpener({
      openingAuthorId: 9001,
      requesterId: 9001,
      openingPublic: true,
      agentIds: agents,
    }),
    true,
  );
  assert.equal(
    isAppFiledOpener({
      openingAuthorId: 44,
      requesterId: 44,
      openingPublic: true,
      agentIds: agents,
    }),
    false,
  );
  assert.equal(
    isAppFiledOpener({
      openingAuthorId: 9001,
      requesterId: 44,
      openingPublic: false,
      agentIds: agents,
    }),
    true,
  );
});

test('applyStaffAuthor falls back to the note sign-off when nothing else knows', () => {
  const byName = new Map([['kai', { staffId: 7, name: 'Kai' }]]);
  const out = applyStaffAuthor(
    { id: 1, body: 'PLUS DENT ON THE SHELL\n\n— Kai', author_name: 'Manager' },
    new Map(),
    new Map(),
    byName,
  );
  assert.equal(out.author_staff_id, 7);
  assert.equal(out.author_name, 'Kai', 'the thread stops reading "Manager"');
  assert.equal(out.author_photo, null, 'the Zendesk roster photo yields to staff identity');
});

test('a recorded mapping OUTRANKS the sign-off', () => {
  // The sign-off is a string in a body an operator could type by hand; the
  // mapping row is what we recorded when we posted.
  const out = applyStaffAuthor(
    { id: 1, body: 'note\n\n— Kai', author_name: 'Manager' },
    new Map([[1, { staffId: 1, name: 'Michael' }]]),
    new Map(),
    new Map([['kai', { staffId: 7, name: 'Kai' }]]),
  );
  assert.equal(out.author_staff_id, 1);
  assert.equal(out.author_name, 'Michael');
});

test('an unsigned comment, or a sign-off naming nobody, stays unattributed', () => {
  const untouched = applyStaffAuthor(
    { id: 1, body: 'a customer reply', author_name: 'Manager' },
    new Map(),
    new Map(),
    new Map([['kai', { staffId: 7, name: 'Kai' }]]),
  );
  assert.equal(untouched.author_staff_id, undefined);
  assert.equal(untouched.author_name, 'Manager');

  const stranger = applyStaffAuthor(
    { id: 2, body: 'note\n\n— Someone Else', author_name: 'Manager' },
    new Map(),
    new Map(),
    new Map([['kai', { staffId: 7, name: 'Kai' }]]),
  );
  assert.equal(stranger.author_staff_id, undefined);
});
