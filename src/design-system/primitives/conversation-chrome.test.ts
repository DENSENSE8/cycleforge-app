/**
 * Unit tests — conversation chrome SoT (hard DS primitive).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONVERSATION_BODY,
  CONVERSATION_COMPOSER_DOCK_INTERNAL,
  CONVERSATION_COMPOSER_PAD,
  CONVERSATION_DAY_HEADER,
  CONVERSATION_DETAIL_SURFACE,
  CONVERSATION_HEADER_ACTION_BTN,
  CONVERSATION_SHELL,
  conversationShell,
  formatConversationAge,
} from './conversation-chrome';

describe('formatConversationAge', () => {
  const now = Date.parse('2026-08-12T06:00:00.000Z');

  it('maps hours to N hrs', () => {
    assert.equal(
      formatConversationAge(new Date(now - 9 * 3_600_000).toISOString(), now),
      '9 hrs',
    );
  });

  it('maps minutes to N mins', () => {
    assert.equal(
      formatConversationAge(new Date(now - 30 * 60_000).toISOString(), now),
      '30 mins',
    );
  });

  it('returns null for empty', () => {
    assert.equal(formatConversationAge(null, now), null);
  });
});

describe('conversationShell', () => {
  it('public cards are gray canvas', () => {
    const cls = conversationShell(false);
    assert.match(cls, /bg-surface-canvas/);
    assert.ok(!cls.includes('bg-amber-50'));
    assert.match(cls, /flex-1/);
  });

  it('internal cards wash amber', () => {
    assert.match(conversationShell(true), /bg-amber-50/);
    assert.match(CONVERSATION_SHELL, /bg-surface-canvas/);
  });
});

describe('conversation plane + type', () => {
  it('detail surface is white with Inter sans', () => {
    assert.match(CONVERSATION_DETAIL_SURFACE, /bg-surface-card/);
    assert.match(CONVERSATION_DETAIL_SURFACE, /font-sans/);
  });

  it('body uses caption Inter, not condensed micro', () => {
    assert.match(CONVERSATION_BODY, /font-sans/);
    assert.doesNotMatch(CONVERSATION_BODY, /text-role-micro/);
  });

  it('header actions are perfect circles', () => {
    assert.match(CONVERSATION_HEADER_ACTION_BTN, /rounded-full/);
    assert.match(CONVERSATION_HEADER_ACTION_BTN, /h-8 w-8/);
  });
});

describe('sticky day band', () => {
  it('paints the conversation plane so rows cannot read through the docked date', () => {
    assert.match(CONVERSATION_DAY_HEADER, /bg-surface-card/);
    assert.doesNotMatch(CONVERSATION_DAY_HEADER, /bg-transparent/);
    // Opacity/blur would let the card underneath ghost through the label.
    assert.doesNotMatch(CONVERSATION_DAY_HEADER, /bg-surface-card\//);
  });
});

describe('floating composer', () => {
  it('internal composer carries channel on the hairline, never a filled wash', () => {
    assert.match(CONVERSATION_COMPOSER_DOCK_INTERNAL, /border-amber-/);
    assert.doesNotMatch(CONVERSATION_COMPOSER_DOCK_INTERNAL, /bg-amber/);
    // The fill still belongs on POSTED internal messages.
    assert.match(conversationShell(true), /bg-amber-50/);
  });

  it('composer pad paints no band fill and fades the thread under the card', () => {
    assert.match(CONVERSATION_COMPOSER_PAD, /bg-transparent/);
    assert.match(CONVERSATION_COMPOSER_PAD, /before:bg-gradient-to-t/);
  });
});
