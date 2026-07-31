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

describe('support chat type hierarchy (embedded)', () => {
  const thread = readFileSync(THREAD, 'utf8');
  const header = readFileSync(HEADER, 'utf8');

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
    assert.match(header, /compact \? 'text-role-caption' : 'text-role-body'/);
    assert.doesNotMatch(header, /compact \? 'text-role-micro' : 'text-role-body'/);
  });

  it('passes onOpenPhoto into renderInlineMarkdown', () => {
    assert.match(thread, /renderInlineMarkdown\(c\.body, \{ onOpenPhoto \}\)/);
  });
});
