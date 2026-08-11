/**
 * Station Ticket Displays — the whole column is FLUSH: host, conversation rows
 * and floating composer all sit edge-to-edge, and a bubble fills the width.
 *
 * Ruled 2026-08-10, reversing the 2026-08-05 rows-own-`px-4` grammar FOR THIS
 * STREAM ONLY. The Displays column is already narrow (the station middle is
 * locked at ~720 beside it), and the ticket spent that measure twice — a `px-4`
 * list wrapping bubbles that were themselves capped at 85%. Every other
 * Displays leaf keeps `DISPLAYS_BODY_INSET`, which is why the token still
 * exists and why this guard now asserts its ABSENCE here rather than being
 * deleted.
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

  it('bubble stream + floating composer carry NO horizontal gutter', () => {
    assert.doesNotMatch(streamCode, /DISPLAYS_BODY_INSET/);
    assert.doesNotMatch(composerCode, /DISPLAYS_BODY_INSET/);
    // Vertical breath only on the floating wrapper — and no hand-rolled px-*
    // replacement sneaking the gutter back in under another name.
    assert.match(composerCode, /className="min-w-0 shrink-0 py-2"/);
  });

  it('a bubble fills the column instead of capping at a percentage', () => {
    assert.doesNotMatch(streamCode, /max-w-\[min\(100%/);
    assert.match(streamCode, /'min-w-0 w-full stack-tight rounded-2xl border px-3 py-2'/);
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
