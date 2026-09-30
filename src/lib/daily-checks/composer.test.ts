import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTicketFastPath,
  dailyComposerCreateBody,
  dailyComposerError,
  dailyComposerLinkInputs,
  newDailyComposerDraft,
  parseTicketFastPath,
  setComposerSubject,

  type DailyComposerDraft,
} from '@/lib/daily-checks/composer';

const draftWith = (over: Partial<DailyComposerDraft>): DailyComposerDraft => ({
  ...newDailyComposerDraft(),
  ...over,
});

/** A draft with the Ticket face active — where the one field means a ticket. */
const ticketDraft = (over: Partial<DailyComposerDraft> = {}): DailyComposerDraft =>
  draftWith({ subject: 'ticket', kind: 'once', ...over });

test('a bare ticket reference is recognised in every form the operator types', () => {
  for (const raw of [
    '12345',
    '#12345',
    ' 12345 ',
    'zd 12345',
    'ZD#12345',
    'ticket 12345',
    'Ticket #12345',
    'https://acme.zendesk.com/agent/tickets/12345',
  ]) {
    assert.equal(parseTicketFastPath(raw), 12345, `${raw} must resolve to the ticket`);
  }
});

test('a single-digit ticket is legal — the slider offers #4, so "4" must commit', () => {
  assert.equal(parseTicketFastPath('4'), 4);
  assert.equal(parseTicketFastPath('#4'), 4);
});

test('prose is never a ticket, even on the Ticket face', () => {
  for (const raw of [
    'Unlock the dock door',
    'Move 12345 to the back room', // a number INSIDE a sentence is prose
    'Bay 5',
    '',
    'ticket',
    '0', // zero is not a ticket id
  ]) {
    assert.equal(parseTicketFastPath(raw), null, `${raw} must not resolve to a ticket`);
  }
});

test('Ticket face: the typed number becomes a complete, linked, today-only row', () => {
  const draft = applyTicketFastPath(ticketDraft({ title: '48120' }));

  assert.equal(draft.title, 'Ticket #48120', 'the row must read as a ticket, not a bare number');
  assert.equal(draft.ticketId, '48120', 'the number becomes the LINK — the row identity');
  assert.equal(draft.glyph, null, 'v1 carries NO icon — the operator asked for none');
  assert.equal(
    draft.kind,
    'once',
    'a recurring ticket would reappear forever and miss on every future report',
  );
});

test('Task face: a number stays a literal title — intent is declared, never guessed', () => {
  // This is the whole reason the switcher replaced auto-detect: the task "5150"
  // and ticket 5150 are indistinguishable by text alone.
  const draft = draftWith({ title: '5150' });
  assert.deepEqual(applyTicketFastPath(draft), draft);

  const body = dailyComposerCreateBody(draft);
  assert.equal(body.title, '5150', 'the title the operator typed survives verbatim');
  assert.equal(body.kind, 'recurring', 'a named shift job recurs');

  const links = dailyComposerLinkInputs(draft);
  assert.ok(links.ok);
  assert.deepEqual(links.links, [], 'a Task-face row carries no ticket link');
});

test('a recurring task keeps its item description but never carries a personal owner', () => {
  const body = dailyComposerCreateBody(
    draftWith({
      title: 'Sweep the loading bay',
      description: 'Clear loose labels before the carrier pickup.',
      ownerId: 20,
      ownerName: 'Sam',
    }),
  );

  assert.equal(body.description, 'Clear loose labels before the carrier pickup.');
  assert.equal(body.assignedStaffId, undefined, 'recurring work belongs to the whole shift');
});

test('an item description is capped at 2000 characters', () => {
  assert.equal(
    dailyComposerError(draftWith({ title: 'Sweep the loading bay', description: 'x'.repeat(2000) })),
    null,
  );
  assert.equal(
    dailyComposerError(draftWith({ title: 'Sweep the loading bay', description: 'x'.repeat(2001) })),
    'The description must be 2000 characters or fewer',
  );
});


test('a chip tapped in the slider outranks the typed text', () => {
  const draft = applyTicketFastPath(ticketDraft({ title: '999', ticketId: '4242' }));
  assert.equal(draft.ticketId, '4242');
  assert.equal(draft.title, 'Ticket #4242', 'the row names the ticket that was PICKED');
});

test('ticket-mode normalization is idempotent', () => {
  const once = applyTicketFastPath(ticketDraft({ title: '77123' }));
  assert.deepEqual(applyTicketFastPath(once), once);
});

test('a glyph the operator explicitly picked still survives', () => {
  // v1 adds none, but it must not ERASE a deliberate choice from the full form.
  const draft = applyTicketFastPath(ticketDraft({ title: '5150', glyph: '🚚' }));
  assert.equal(draft.glyph, '🚚', 'the operator picked it; the shortcut must not overwrite it');
});

test('normalization never mutates the draft it is given', () => {
  const before = ticketDraft({ title: '31337' });
  applyTicketFastPath(before);
  assert.equal(before.title, '31337');
  assert.equal(before.ticketId, '');
});

/**
 * Flipping the switcher carries the consequences so the operator does not have
 * to remember them.
 */
test('switching to Ticket clears prose and forces the once cadence', () => {
  const next = setComposerSubject(draftWith({ title: 'Customer support for Amazon' }), 'ticket');
  assert.equal(next.subject, 'ticket');
  assert.equal(next.title, '', 'prose is not a ticket id');
  assert.equal(next.kind, 'once');
});

test('switching back to Task drops the ticket link and restores Every day', () => {
  const next = setComposerSubject(ticketDraft({ title: '48120', ticketId: '48120' }), 'task');
  assert.equal(next.subject, 'task');
  assert.equal(next.ticketId, '', 'a titled to-do must not silently keep a ticket attached');
  assert.equal(next.kind, 'recurring');
});

test('switching to the face already active is a no-op', () => {
  const draft = draftWith({ title: 'Sweep the dock' });
  assert.deepEqual(setComposerSubject(draft, 'task'), draft, 'must not wipe a draft in progress');
});

/**
 * Every composer mount goes through these three functions, so normalizing
 * inside them is what keeps capture identical across surfaces. These pin
 * that wiring.
 */
test('the create body a Ticket-face draft sends is the ticket row', () => {
  const body = dailyComposerCreateBody(ticketDraft({ title: '#8899' }));
  assert.equal(body.title, 'Ticket #8899');
  assert.equal(body.kind, 'once');
  assert.equal(body.glyph, null, 'no icon rides along by default');
});

test('a Ticket-face draft attaches a ZENDESK_TICKET link with no disclosure opened', () => {
  const links = dailyComposerLinkInputs(ticketDraft({ title: '8899' }));
  assert.ok(links.ok);
  assert.deepEqual(links.links, [{ entityType: 'ZENDESK_TICKET', entityId: 8899 }]);
});

test('each face refuses in its OWN vocabulary', () => {
  assert.equal(dailyComposerError(ticketDraft({ title: '8899' })), null);
  assert.equal(dailyComposerError(newDailyComposerDraft()), 'A title is required');
  assert.equal(dailyComposerError(ticketDraft()), 'Enter or pick a ticket number');
  assert.equal(
    dailyComposerError(ticketDraft({ title: 'move it upstairs' })),
    'That is not a ticket number',
    'a Ticket-face error must name the ticket, never a field the face does not show',
  );
});
