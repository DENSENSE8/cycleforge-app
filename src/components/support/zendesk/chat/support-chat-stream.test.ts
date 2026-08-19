/**
 * Unit tests — conversation scroll-port math behind the floating composer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STREAM_AT_END_SLACK_PX,
  isConversationAtEnd,
} from './support-chat-utils';

const port = (scrollTop: number) => ({
  scrollHeight: 2_000,
  clientHeight: 600,
  scrollTop,
});

describe('isConversationAtEnd', () => {
  it('parked exactly at the end re-docks when the composer grows', () => {
    assert.equal(isConversationAtEnd(port(1_400)), true);
  });

  it('a hair off the end still counts (half-scrolled pixels must not break it)', () => {
    assert.equal(isConversationAtEnd(port(1_400 - STREAM_AT_END_SLACK_PX)), true);
  });

  it('a reader up in history is never yanked back down', () => {
    assert.equal(isConversationAtEnd(port(1_400 - STREAM_AT_END_SLACK_PX - 1)), false);
    assert.equal(isConversationAtEnd(port(0)), false);
  });

  it('a thread shorter than its port is always at the end', () => {
    assert.equal(
      isConversationAtEnd({ scrollHeight: 300, clientHeight: 600, scrollTop: 0 }),
      true,
    );
  });
});
