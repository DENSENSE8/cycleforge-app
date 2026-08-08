/**
 * Station Ticket Displays — conversation body + floating composer own the
 * readable gutter (`DISPLAYS_BODY_INSET`); the Displays host stays flush.
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
  const stream = read('src/components/support/zendesk/chat/MergedRecordStream.tsx');
  const streamCode = code(stream);
  const composer = read('src/components/support/zendesk/chat/SupportChatComposer.tsx');
  const composerCode = code(composer);
  const focus = read('src/components/support/service-workspace/SupportTicketFocus.tsx');
  const focusCode = code(focus);

  it('TicketDisplayHost does not wrap the detail in DISPLAYS_BODY_INSET', () => {
    // Rows own the gutter — never the flush Displays host / whole-detail wrapper.
    assert.doesNotMatch(hostCode, /DISPLAYS_BODY_INSET/);
  });

  it('TicketDisplayHost opts into streamVariant="bubble"', () => {
    assert.match(hostCode, /streamVariant="bubble"/);
  });

  it('bubble stream + floating composer own DISPLAYS_BODY_INSET', () => {
    assert.match(streamCode, /DISPLAYS_BODY_INSET/);
    assert.match(composerCode, /DISPLAYS_BODY_INSET/);
    // Vertical breath only on the floating wrapper — not a second horizontal pad.
    assert.match(composerCode, /DISPLAYS_BODY_INSET,\s*'min-w-0 shrink-0 py-2'/);
  });

  it('SupportTicketDetail defaults streamVariant to ledger and forwards it', () => {
    assert.match(detail, /streamVariant = 'ledger'/);
    assert.match(code(detail), /variant=\{streamVariant\}/);
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
