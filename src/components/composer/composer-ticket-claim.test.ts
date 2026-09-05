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
const COMPOSER_HOST = './StationComposerHost.tsx';

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
  assert.match(src(UNBOX), /askMode \? \(\s*\n\s*<StationAskPane/);
  assert.match(src(UNBOX), /hasTicketId \? \(\s*\n\s*<StationTicketPane/);
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

test('the putaway location control stays mounted across Unbox and Ticket', () => {
  const host = src(COMPOSER_HOST);
  assert.match(host, /const locationFooter = locationAction;/);
  assert.doesNotMatch(
    host,
    /const locationFooter = keepTrailing \? locationAction : undefined;/,
    'Ticket must not remove the location scan control',
  );
});

test('Unbox keeps location inline in the item row instead of adding a task context bar', () => {
  const panel = src(UNBOX);
  assert.doesNotMatch(panel, /TaskContextBar/);
  assert.match(panel, /buildUnboxOverview/);
  assert.match(panel, /onOpenLocation/);
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

test('filing a ticket archives carton photos on the same create POST', () => {
  // NAS archive is not a follow-up the operator has to remember. Composer
  // create hits POST /api/receiving/zendesk-claim, which always runs
  // fileReceivingClaim → archivePhotos. The ticket-chip Archive row is the
  // retry, not the first copy.
  const hook = src('../receiving/workspace/line-edit/hooks/useComposerTicketClaim.ts');
  const fileBody = hook.slice(hook.indexOf('const fileCreate ='), hook.indexOf('  const fileLink ='));
  assert.match(fileBody, /\/api\/receiving\/zendesk-claim'/);
  assert.doesNotMatch(fileBody, /dryRun:\s*true/);
  assert.match(fileBody, /data\.archiveWarning/, 'failed NAS copy must surface on file');

  const route = src('../../app/api/receiving/zendesk-claim/route.ts');
  assert.match(route, /fileReceivingClaim/);
  assert.match(route, /archiveOk: filed\.archiveOk/);

  const filing = src('../../lib/receiving/file-receiving-claim.ts');
  assert.equal(
    filing.split('deps.archivePhotos({').length - 1,
    2,
    'create and reuse both archive carton photos',
  );
});

test('Test create is a DEV tool — it never reaches a production dock', () => {
  const hook = src('../receiving/workspace/line-edit/hooks/useComposerTicketClaim.ts');
  assert.match(hook, /canTest: isClaim && process\.env\.NODE_ENV !== 'production'/);
  // It files nothing.
  const body = hook.slice(hook.indexOf('const testCreate ='), hook.indexOf('return {\n    isClaim'));
  assert.match(body, /dryRun: true/);
  assert.doesNotMatch(body, /onTicketCreated/, 'a dry run must not announce a ticket');
  // And it shows the operator the real assembled message.
  assert.match(body, /setBodyState\(data\.description\)/);

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

test('Omni Composer Ticket Cc seeds the same public-email history as the claim rail', () => {
  // The rail restored receiving-claim:cc-emails; Ticket mode started []. Filing
  // from StationComposerHost then omitted CCs the operator already saw on the ticket.
  assert.match(
    src('../../lib/composer/ticket-cc.ts'),
    /COMPOSER_CC_HISTORY_STORAGE_KEY = 'receiving-claim:cc-emails'/,
  );
  assert.match(src(NOTES), /useComposerCcHistory/);
  assert.match(src('./useTicketComposer.ts'), /useComposerCcHistory/);
  assert.match(
    src('../receiving/workspace/claim/hooks/useReceivingClaimController.ts'),
    /useComposerCcHistory/,
  );
});

test('Ticket claim drafts via AI from template facts — not a dumped template body', () => {
  const hook = src('../receiving/workspace/line-edit/hooks/useComposerTicketClaim.ts');
  assert.match(hook, /\/api\/receiving\/zendesk-claim\/draft/);
  assert.doesNotMatch(hook, /useClaimTemplate/);
  assert.match(hook, /prefillReason/);
  assert.match(hook, /fileLink/);
  assert.match(hook, /assist-seller/);
  assert.match(src(NOTES), /ComposerClaimInset/);
  assert.match(src(NOTES), /ComposerAccessoryStage/);
  assert.match(src(NOTES), /ComposerAccessoryCluster/);
  assert.match(src(NOTES), /returnClaimPrefill/);
  assert.match(src(COMPOSER_HOST), /ticketHeaderEnd/);
  assert.match(src(COMPOSER_HOST), /ticketAccessory/);
  assert.match(src('./ComposerAccessoryStage.tsx'), /WeldedFeedbackPanel/);
  assert.match(src('./ComposerAccessoryStage.tsx'), /disclose="always"/);
  assert.doesNotMatch(src('./ComposerAccessoryStage.tsx'), /matchWidth/);
  assert.match(hook, /persistSellerClaimMessageDraft/);
  assert.match(
    src('../receiving/workspace/claim/components/ClaimComposeStep.tsx'),
    /claim-compose-composer-cue/,
  );
  assert.doesNotMatch(
    src('../receiving/workspace/claim/components/ClaimComposeStep.tsx'),
    /ClaimTemplateEditor/,
  );
});
