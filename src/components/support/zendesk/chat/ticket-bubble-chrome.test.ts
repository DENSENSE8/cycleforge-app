/**
 * Ticket bubble age face — compact lane age expanded to `N hrs` / `N mins`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTicketBubbleAge } from './ticket-bubble-chrome';

describe('formatTicketBubbleAge', () => {
  const now = Date.parse('2026-08-12T06:00:00.000Z');

  it('maps hours to N hrs', () => {
    const nineHrsAgo = new Date(now - 9 * 3_600_000).toISOString();
    assert.equal(formatTicketBubbleAge(nineHrsAgo, now), '9 hrs');
  });

  it('maps one hour to 1 hr', () => {
    const oneHrAgo = new Date(now - 1 * 3_600_000).toISOString();
    assert.equal(formatTicketBubbleAge(oneHrAgo, now), '1 hr');
  });

  it('maps minutes to N mins', () => {
    const thirtyMinAgo = new Date(now - 30 * 60_000).toISOString();
    assert.equal(formatTicketBubbleAge(thirtyMinAgo, now), '30 mins');
  });

  it('maps days to N days', () => {
    const threeDaysAgo = new Date(now - 3 * 24 * 3_600_000).toISOString();
    assert.equal(formatTicketBubbleAge(threeDaysAgo, now), '3 days');
  });

  it('returns null for empty', () => {
    assert.equal(formatTicketBubbleAge(null, now), null);
    assert.equal(formatTicketBubbleAge('', now), null);
  });
});
