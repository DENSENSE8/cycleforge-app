import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStaffAuthor, staffNameFromNoteSignature } from './comment-staff-identity';

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
