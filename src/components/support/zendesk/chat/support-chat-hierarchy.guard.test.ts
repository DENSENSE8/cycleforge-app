/**
 * Carton / embedded ticket chat: readable body, quiet chrome.
 * Compact densifies spacing — it must NOT collapse bubble body to text-role-micro.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const THREAD = join(ROOT, 'src/components/support/zendesk/chat/SupportChatThread.tsx');
const HEADER = join(ROOT, 'src/components/support/zendesk/chat/SupportChatHeader.tsx');
/**
 * The subject moved out of the header on 2026-08-02 — one field, composed by
 * both the chat header and the `/support` pane-header identity row, because it
 * was being rendered twice on that surface.
 */
const SUBJECT = join(ROOT, 'src/components/support/zendesk/chat/TicketSubjectField.tsx');

describe('support chat type hierarchy (embedded)', () => {
  const thread = readFileSync(THREAD, 'utf8');
  const header = readFileSync(HEADER, 'utf8');
  const subject = readFileSync(SUBJECT, 'utf8');

  it('bubble body always uses text-role-data (never micro when compact)', () => {
    assert.match(thread, /text-role-data leading-relaxed/);
    assert.doesNotMatch(
      thread,
      /compact\s*\?\s*['`][^'`]*text-role-micro[^'`]*leading-snug/,
    );
    // No compact ternary that puts micro on the bubble shell.
    assert.doesNotMatch(thread, /rounded-bl-md px-2\.5 py-1\.5 text-role-micro/);
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

  it('passes onOpenPhoto into renderInlineMarkdown', () => {
    assert.match(thread, /renderInlineMarkdown\(c\.body, \{ onOpenPhoto \}\)/);
  });
});
