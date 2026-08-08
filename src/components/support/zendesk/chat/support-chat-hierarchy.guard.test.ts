/**
 * Carton / embedded ticket stream: readable body, quiet chrome, shared waist.
 *
 * Migrated 2026-08-02 when `SupportChatThread` was deleted and the conversation
 * became the `MergedRecordStream` ledger. Re-pointed 2026-08-08 when station
 * Ticket Displays opted into `variant="bubble"` (read vs select) — the type
 * hierarchy + scroll-ownership pins stay; the absolute bubble ban became a
 * two-shell contract over one waist.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const STREAM = join(ROOT, 'src/components/support/zendesk/chat/MergedRecordStream.tsx');
const HEADER = join(ROOT, 'src/components/support/zendesk/chat/SupportChatHeader.tsx');
/**
 * The subject moved out of the header on 2026-08-02 — one field, composed by
 * both the chat header and the `/support` pane-header identity row, because it
 * was being rendered twice on that surface.
 */
const SUBJECT = join(ROOT, 'src/components/support/zendesk/chat/TicketSubjectField.tsx');

/** Strip comments so a docblock QUOTING a banned class cannot fail its own rule. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('support chat type hierarchy (embedded)', () => {
  const stream = readFileSync(STREAM, 'utf8');
  const streamCode = code(STREAM);
  const header = readFileSync(HEADER, 'utf8');
  const subject = readFileSync(SUBJECT, 'utf8');

  it('message body always uses text-role-data (never micro when compact)', () => {
    assert.match(stream, /text-role-data leading-relaxed/);
    assert.doesNotMatch(
      stream,
      /compact\s*\?\s*['`][^'`]*text-role-micro[^'`]*leading-snug/,
    );
    // No compact ternary that shrinks the body role itself.
    assert.doesNotMatch(stream, /compact \? 'text-role-micro' : 'text-role-data'/);
  });

  it('embedded subject uses text-role-caption, not micro', () => {
    assert.match(subject, /compact \? 'text-role-caption' : 'text-role-body'/);
    assert.doesNotMatch(subject, /compact \? 'text-role-micro' : 'text-role-body'/);
  });

  it('the subject has exactly one renderer', () => {
    // `/support` drew it twice — the pane header's identity row and, one row
    // below, this header's own editable title. Both compose the field now, and
    // the header keeps no private copy of the control.
    assert.match(header, /<TicketSubjectField/);
    assert.doesNotMatch(header, /function TicketSubjectEditor/);
  });

  it('renders block markdown, and passes onOpenPhoto through', () => {
    // A reply arrives with headings, lists and quotes; rendering only the inline
    // grammar showed the customer literal `###` in the ledger.
    assert.match(stream, /renderBlockMarkdown\(msg\.body, \{ onOpenPhoto \}\)/);
  });

  it('two shells over one waist — ledger default + bubble opt-in; no third renderer', () => {
    // Read vs select: ledger keeps the shared left edge; bubble is the station
    // Ticket read surface. Deleted-thread look stays banned; SupportChatThread
    // stays deleted.
    assert.match(stream, /MergedRecordStreamVariant = 'ledger' \| 'bubble'/);
    assert.match(stream, /variant = 'ledger'/);
    assert.match(streamCode, /divide-y divide-border-hairline/);
    assert.match(streamCode, /data-stream-shell="bubble"/);
    assert.match(stream, /DateGroupHeader/);
    assert.match(stream, /zendeskCommentsToTimeline/);
    assert.doesNotMatch(streamCode, /bg-blue-600 text-white/);
    assert.doesNotMatch(streamCode, /SupportChatThread/);
  });

  it('the Zendesk field band is gone from the chat header', () => {
    // Status / priority / assignee / staff moved to the surfaces that own them
    // (pane header identity row, Connections display, details popover).
    assert.doesNotMatch(header, /ZendeskSelect/);
    assert.doesNotMatch(header, /STATUS_OPTIONS|PRIORITY_OPTIONS/);
    assert.doesNotMatch(header, /useAssignTicket|useTicketAssignment/);
  });

  it('the stream is content — the host owns the scroll port', () => {
    assert.doesNotMatch(streamCode, /overflow-y-auto/);
    assert.doesNotMatch(streamCode, /overflow-y-scroll/);
    // No reserved height for a body that may be small.
    assert.doesNotMatch(streamCode, /min-h-\[/);
  });
});
