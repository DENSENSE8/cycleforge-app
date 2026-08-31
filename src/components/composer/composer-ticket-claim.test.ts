import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  STATION_COMPOSER_MODE_DEFAULT,
  stationComposerArrivalMode,
  stationComposerModePlaceholder,
  stationComposerTicketCommitLabel,
} from '@/lib/composer/station-composer-mode';
import { ComposerTicketInsetChrome } from './ComposerTicketInsetChrome';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(here, rel), 'utf8');

const UNBOX = '../receiving/workspace/LineEditPanel.tsx';
const TESTING = '../tech/TestingPanel.tsx';
const NOTES = '../receiving/workspace/line-edit/LineNotesCard.tsx';

test('the commit CTA names the OUTCOME, on both faces', () => {
  // It is a labelled button in the dock now, not a bare return arrow, so the
  // words are what the operator reads before the most consequential press on
  // the bench (ruling 2026-08-31).
  assert.equal(stationComposerTicketCommitLabel(false), 'File ticket →');
  assert.equal(stationComposerTicketCommitLabel(true), 'Update ticket');
  // "Send" is gone: it named the keystroke, not what happens to the ticket.
  assert.doesNotMatch(stationComposerTicketCommitLabel(true), /^Send$/);
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

test('both stations reset the composer to Unbox on carton open', () => {
  for (const rel of [UNBOX, TESTING]) {
    const text = src(rel);
    assert.match(
      text,
      /setComposerMode\(stationComposerArrivalMode\(\)\)/,
      `${rel} must land on the arrival mode`,
    );
    // The auto-flip is what made an operator walk up to a Ticket draft.
    assert.doesNotMatch(
      text,
      /if \(ctx\.open\) \{\s*\n\s*setComposerMode\('ticket'\)/,
      `${rel} still auto-flips to Ticket on open`,
    );
  }
});

test('a FILED ticket shows in every mode; an unlinked one still has no pane', () => {
  // Operator ruling 2026-08-31: mode picks what the COMPOSER writes to, it does
  // not decide whether the record is visible. Unlinked is unchanged — the
  // composer IS the claim there, and a pane above it is a second editor.
  assert.match(src(UNBOX), /\{hasTicketId \? \(\s*\n\s*<StationTicketPane/);
  assert.doesNotMatch(src(UNBOX), /ticketMode && hasTicketId \? \(\s*\n\s*<StationTicketPane/);
  // Testing station is deliberately NOT swept with it — the ruling was made
  // against Unbox and that panel has its own layout. Change it when asked.
  assert.match(src(TESTING), /ticketMode && claimTicketId != null \? \(\s*\n\s*<StationTicketPane/);
});

test('the composer draft and its commit route through the claim when unlinked', () => {
  const notes = src(NOTES);
  assert.match(notes, /ticketDraft=\{claim\.isClaim \? claim\.body : ticketDraft\}/);
  assert.match(notes, /onTicketCommit=\{claim\.isClaim \? claim\.file : handleTicketCommit\}/);
  // The subject is NOT passed to the dock any more — see the inset test below.
  assert.doesNotMatch(notes, /subject=\{claim\.isClaim/);
});

test('no station lets the composer collapse the context bands', () => {
  // Focus used to fold Items and Label away on the station whose job is the
  // note; Ticket mode did it before the field was even touched.
  for (const rel of [UNBOX, TESTING]) {
    const text = src(rel);
    assert.doesNotMatch(text, /bandCollapse\.engage/, `${rel} still collapses on the composer`);
    assert.doesNotMatch(text, /onComposerFocus=/, `${rel} still wires composer focus to collapse`);
  }
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

test('Test create is a DEV tool — it never reaches a production dock', () => {
  const hook = src('../receiving/workspace/line-edit/hooks/useComposerTicketClaim.ts');
  assert.match(hook, /canTest: isClaim && process\.env\.NODE_ENV !== 'production'/);
  // It files nothing.
  const body = hook.slice(hook.indexOf('const testCreate ='), hook.indexOf('return {\n    isClaim'));
  assert.match(body, /dryRun: true/);
  assert.doesNotMatch(body, /onTicketCreated/, 'a dry run must not announce a ticket');
  // And it shows the operator the real assembled message.
  assert.match(body, /template\.onDescriptionChange\(data\.description\)/);

  const notes = src(NOTES);
  assert.match(notes, /if \(claim\.canTest\) \{/, 'the drill row must be gated on canTest');
  assert.match(notes, /Test create \(no ticket\)/);
});

test('typing a note opens the Label band so the sticker shows it', () => {
  const notes = src(NOTES);
  // Typing only — hydrating a saved note must leave the band as the operator
  // left it, which is why this hangs off onChange and not an effect on value.
  assert.match(notes, /if \(next\.trim\(\)\) onNoteTyped\?\.\(\)/);
  assert.match(src(UNBOX), /onNoteTyped=\{\(\) => bands\.open\('label'\)\}/);
});
