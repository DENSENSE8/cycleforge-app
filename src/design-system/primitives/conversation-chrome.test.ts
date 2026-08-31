/**
 * Unit tests — conversation chrome SoT (hard DS primitive).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONVERSATION_BODY,
  CONVERSATION_CLOCK,
  CONVERSATION_CLOCK_PAD,
  CONVERSATION_COPY,
  CONVERSATION_COMPOSER_DOCK_INTERNAL,
  CONVERSATION_COMPOSER_PAD,
  CONVERSATION_DAY_HEADER,
  CONVERSATION_DAY_LABEL,
  CONVERSATION_DETAIL_SURFACE,
  CONVERSATION_HEADER_ACTION_BTN,
  CONVERSATION_INSET,
  CONVERSATION_MARK,
  CONVERSATION_MARK_BOX,
  CONVERSATION_MARK_NODE,
  CONVERSATION_ROW,
  CONVERSATION_SPINE,
  CONVERSATION_STREAM,
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
  it('a public reply is a gray card — the card is the message boundary', () => {
    // The spine says these happened in order; it does not say where one message
    // ends and the next begins. Two consecutive replies from one author with no
    // wrapper read as a single block of prose.
    const cls = conversationShell(false);
    assert.match(cls, /bg-surface-canvas/);
    assert.match(cls, /rounded/);
    assert.match(cls, /border-border-hairline/);
    assert.ok(!cls.includes('bg-amber-50'));
    assert.match(cls, /flex-1/);
  });

  it('an internal note is the same card with the amber fill', () => {
    // The one row where the fill carries meaning: what the customer can read
    // versus what they cannot.
    const cls = conversationShell(true);
    assert.match(cls, /bg-amber-50/);
    assert.match(cls, /border-amber-200/);
    assert.match(cls, /rounded/);
  });

  it('caps the card at a reading measure — never edge to edge', () => {
    // The station centre floors at 720px and grows with the frame; an uncapped
    // flex-1 card would stretch its lines as wide as the monitor.
    for (const internal of [false, true]) {
      assert.match(conversationShell(internal), /max-w-2xl/);
    }
  });
});

describe('the timeline spine', () => {
  it('is one continuous 1px thread, bridging the stream row gap', () => {
    assert.match(CONVERSATION_SPINE, /w-px/);
    // `stack-tight` puts 6px between rows; without the bridge the line breaks
    // at every message and reads as tick marks, not a thread.
    assert.match(CONVERSATION_SPINE, /-bottom-1\.5/);
    assert.match(CONVERSATION_SPINE, /group-last:bottom-0/);
  });

  it('runs behind the node, and the node is opaque enough to mask it', () => {
    assert.match(CONVERSATION_SPINE, /z-0/);
    assert.match(CONVERSATION_MARK, /z-10/);
    assert.match(CONVERSATION_MARK, /bg-surface-sunken/);
  });

  it('does not paint sunken fill on the staff-node class — colour lives on StaffAvatar', () => {
    assert.match(CONVERSATION_MARK_NODE, /z-10/);
    assert.doesNotMatch(CONVERSATION_MARK_NODE, /bg-surface-sunken/);
  });

  it('top-aligns the avatar with the author row', () => {
    assert.match(CONVERSATION_MARK_BOX, /justify-center/);
    assert.match(CONVERSATION_MARK_BOX, /pt-1\.5/);
    assert.doesNotMatch(CONVERSATION_MARK_BOX, /-mt-0\.5/);
    assert.match(CONVERSATION_ROW, /items-start/);
  });
});

describe('conversation inset', () => {
  it('matches station band / ticket-title px-3, not Displays px-4', () => {
    assert.match(CONVERSATION_INSET, /px-3/);
    assert.match(CONVERSATION_STREAM, /px-3/);
    assert.doesNotMatch(CONVERSATION_STREAM, /px-4/);
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

describe('the day divider', () => {
  it('centres the civil date — clock lives in the message, not this row', () => {
    assert.match(CONVERSATION_DAY_HEADER, /justify-center/);
    assert.doesNotMatch(CONVERSATION_DAY_HEADER, /sticky/);
    assert.match(CONVERSATION_DAY_LABEL, /text-role-micro/);
  });
});

describe('in-card clock', () => {
  it('reserves the last line with a float, and paints the clock over it', () => {
    assert.match(CONVERSATION_CLOCK_PAD, /float-right/);
    assert.match(CONVERSATION_CLOCK, /absolute/);
    assert.match(CONVERSATION_COPY, /stack-row\]:contents/);
    assert.match(CONVERSATION_COPY, /p:last-of-type\]:inline/);
  });
});

describe('floating composer', () => {
  it('internal composer carries channel on the hairline, never a filled wash', () => {
    assert.match(CONVERSATION_COMPOSER_DOCK_INTERNAL, /border-amber-/);
    assert.doesNotMatch(CONVERSATION_COMPOSER_DOCK_INTERNAL, /bg-amber/);
    // The fill still belongs on POSTED internal messages.
    assert.match(conversationShell(true), /bg-amber-50/);
  });

  it('composer pad paints no band fill and no top-edge fade', () => {
    assert.match(CONVERSATION_COMPOSER_PAD, /bg-transparent/);
    assert.doesNotMatch(CONVERSATION_COMPOSER_PAD, /before:bg-gradient-to-t/);
    assert.doesNotMatch(CONVERSATION_COMPOSER_PAD, /before:-top-/);
  });
});
