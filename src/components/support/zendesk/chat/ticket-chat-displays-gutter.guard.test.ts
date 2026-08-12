/**
 * Station Ticket Displays — conversation body + floating composer own the
 * readable gutter via {@link ./ticket-bubble-chrome}; the Displays host stays
 * flush. Bubbles stay left-aligned and capped, one white shell face, micro
 * meta + `N hrs` age. Composer keeps bottom pad above the leaf footer.
 *
 * Bubble variant is opted in from `TicketDisplayHost`, not from `embedded`
 * alone (`/support` focus is also embedded and must stay ledger).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Strip comments so a docblock quoting a token cannot fail its own rule. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('station Ticket chat Displays gutter + bubble opt-in', () => {
  const host = read('src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx');
  const hostCode = code(host);
  const detail = read('src/components/support/zendesk/chat/SupportTicketDetail.tsx');
  const detailCode = code(detail);
  const stream = read('src/components/support/zendesk/chat/MergedRecordStream.tsx');
  const streamCode = code(stream);
  const composer = read('src/components/support/zendesk/chat/SupportChatComposer.tsx');
  const composerCode = code(composer);
  const chrome = read('src/components/support/zendesk/chat/ticket-bubble-chrome.ts');
  const chromeCode = code(chrome);
  const focus = read('src/components/support/service-workspace/SupportTicketFocus.tsx');
  const focusCode = code(focus);

  it('TicketDisplayHost does not wrap the detail in DISPLAYS_BODY_INSET', () => {
    // Rows own the gutter — never the flush Displays host / whole-detail wrapper.
    assert.doesNotMatch(hostCode, /DISPLAYS_BODY_INSET/);
  });

  it('TicketDisplayHost opts into streamVariant="bubble"', () => {
    assert.match(hostCode, /streamVariant="bubble"/);
  });

  it('stream + composer + detail import ticket-bubble-chrome SoT', () => {
    assert.match(streamCode, /from '\.\/ticket-bubble-chrome'/);
    assert.match(composerCode, /TICKET_COMPOSER_PAD/);
    assert.match(detailCode, /TICKET_DETAIL_SURFACE/);
    assert.match(chromeCode, /TICKET_BUBBLE_SHELL/);
    assert.match(chromeCode, /formatTicketBubbleAge/);
    assert.match(chromeCode, /DISPLAYS_BODY_INSET/);
  });

  it('QC reply presets default on; Unbox Ticket Displays can opt out', () => {
    assert.match(
      composerCode,
      /showReplyPresets = true/,
      'presets stay on for Testing · Arrival · /support',
    );
    assert.match(composerCode, /showReplyPresets \? \(/);
  });

  it('bubble chrome is left-aligned, capped, white shell — detail plane stays host-default', () => {
    assert.match(chromeCode, /max-w-\[min\(100%,75%\)\]/);
    assert.match(chromeCode, /TICKET_DETAIL_SURFACE = 'bg-surface-canvas\/40'/);
    assert.match(chromeCode, /TICKET_BUBBLE_SHELL[\s\S]*bg-surface-card/);
    assert.match(chromeCode, /TICKET_BUBBLE_MARK/);
    assert.match(streamCode, /TICKET_BUBBLE_ROW/);
    assert.match(streamCode, /TICKET_BUBBLE_SHELL/);
    assert.match(streamCode, /dense/);
    assert.doesNotMatch(chromeCode, /TICKET_DETAIL_SURFACE = 'bg-surface-sunken'/);
    assert.doesNotMatch(streamCode, /bg-blue-50|bg-amber-50/);
    assert.doesNotMatch(streamCode, /ours \? 'flex-row-reverse'/);
  });

  it('bubble Internal chip paints after age (N hrs · Internal)', () => {
    // Author → age → Internal — never Internal leading the meta line.
    const metaFn = streamCode.slice(streamCode.indexOf('function MetaLine'));
    const agePos = metaFn.indexOf('<RowTime');
    const internalPos = metaFn.indexOf('TICKET_BUBBLE_INTERNAL_CHIP');
    assert.ok(agePos >= 0 && internalPos > agePos, 'Internal chip must follow RowTime');
  });
  it('bubble meta uses micro + formatTicketBubbleAge (N hrs)', () => {
    assert.match(streamCode, /TICKET_BUBBLE_META/);
    assert.match(streamCode, /formatTicketBubbleAge/);
    assert.match(chromeCode, /N hrs|\$\{n\} hrs/);
  });

  it('SupportTicketDetail defaults streamVariant to ledger and forwards it', () => {
    assert.match(detail, /streamVariant = 'ledger'/);
    assert.match(detailCode, /variant=\{streamVariant\}/);
  });

  it('/support focus stays ledger — does not pass streamVariant="bubble"', () => {
    assert.doesNotMatch(focusCode, /streamVariant="bubble"/);
  });

  it('still one waist — no SupportChatThread resurrection', () => {
    assert.match(stream, /zendeskCommentsToTimeline/);
    assert.match(stream, /DateGroupHeader/);
    assert.match(stream, /renderBlockMarkdown/);
    assert.doesNotMatch(streamCode, /SupportChatThread/);
    assert.doesNotMatch(hostCode, /SupportChatThread/);
  });
});
