import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  STATION_COMPOSER_MODE_DEFAULT,
  stationComposerArrivalMode,
  stationComposerModePlaceholder,
  stationComposerTicketCommitLabel,
} from '@/lib/composer/station-composer-mode';
import { ComposerTicketInsetChrome } from './ComposerTicketInsetChrome';

test('the commit CTA names the OUTCOME, on every face', () => {
  // It is a labelled button in the dock now, not a bare return arrow, so the
  // words are what the operator reads before the most consequential press on
  // the bench (ruling 2026-08-31).
  assert.equal(stationComposerTicketCommitLabel(false, true), 'File ticket →');
  assert.equal(stationComposerTicketCommitLabel(false, false), 'File ticket →');
  // A public comment reaches the customer; the label says so (operator 2026-10-04).
  assert.equal(stationComposerTicketCommitLabel(true, true), 'Send public reply');
  assert.equal(stationComposerTicketCommitLabel(true, false), 'Add internal note');
  // Never the neutral verb that hid a customer-visible send.
  assert.doesNotMatch(stationComposerTicketCommitLabel(true, true), /Update ticket/);
  assert.doesNotMatch(stationComposerTicketCommitLabel(true, false), /Update ticket/);
  // A bare "Send" names the keystroke, not what happens to the ticket.
  assert.doesNotMatch(stationComposerTicketCommitLabel(true, true), /^Send$/);
});

test('an unlinked carton prompts for the claim body, not for a form above it', () => {
  const unlinked = stationComposerModePlaceholder('ticket', { hasTicket: false });
  assert.match(unlinked, /Enter to file the ticket/);
  // The old copy pointed up at a claim form that no longer mounts there.
  assert.doesNotMatch(unlinked, /above/);
  assert.match(
    stationComposerModePlaceholder('ticket', { hasTicket: true, ticketLabel: '#42' }),
    /Update on #42/,
  );
});

test('arriving at a station lands on Unbox', () => {
  assert.equal(stationComposerArrivalMode(), 'unbox');
  assert.equal(stationComposerArrivalMode(), STATION_COMPOSER_MODE_DEFAULT);
});
test('the dock carries NO subject slice — the title lives in the display', () => {
  // Operator ruling 2026-08-31. A title strip at the top of the composer made
  // the dock read as a form and duplicated the title the ticket display already
  // carries; the display's own title now scrolls inside the thread instead.
  const html = renderToStaticMarkup(
    createElement(ComposerTicketInsetChrome, {
      isPublic: false,
      ccs: [],
      onCcsChange: () => {},
      ccDraft: '',
      onCcDraftChange: () => {},
    } as never),
  );
  assert.equal(html, '', 'internal + nothing staged renders nothing at all');

  // Hand it a subject anyway: the slot is gone, so it must not paint one.
  // Asserted against rendered DOM rather than the component's source — a regex
  // over a .tsx cannot tell a prop from the same word in a comment.
  const withSubject = renderToStaticMarkup(
    createElement(ComposerTicketInsetChrome, {
      isPublic: false,
      ccs: [],
      onCcsChange: () => {},
      ccDraft: '',
      onCcDraftChange: () => {},
      subject: 'eBay — Damage // PO 01-15064',
    } as never),
  );
  assert.equal(withSubject, '');
});

test('nothing staged on an internal note renders nothing', () => {
  const html = renderToStaticMarkup(
    createElement(ComposerTicketInsetChrome, {
      isPublic: false,
      ccs: [],
      onCcsChange: () => {},
      ccDraft: '',
      onCcDraftChange: () => {},
    }),
  );
  assert.equal(html, '');
});
