/**
 * Unit tests for ticket-watch cache diff (pure — no DB).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffTicketWatchCaches } from '@/lib/jobs/zendesk-ticket-watch-diff';

describe('diffTicketWatchCaches', () => {
  it('unchanged when subject and status match', () => {
    const d = diffTicketWatchCaches(
      { subject: 'Motherboard', status: 'open' },
      { subject: 'Motherboard', status: 'open' },
    );
    assert.equal(d.changed, false);
    assert.equal(d.summary, null);
  });

  it('trims whitespace before compare', () => {
    const d = diffTicketWatchCaches(
      { subject: ' Motherboard ', status: 'open' },
      { subject: 'Motherboard', status: 'open' },
    );
    assert.equal(d.changed, false);
  });

  it('reports status change', () => {
    const d = diffTicketWatchCaches(
      { subject: 'Motherboard', status: 'open' },
      { subject: 'Motherboard', status: 'pending' },
    );
    assert.equal(d.changed, true);
    assert.match(d.summary ?? '', /status open → pending/);
  });

  it('reports subject change', () => {
    const d = diffTicketWatchCaches(
      { subject: 'Old', status: 'open' },
      { subject: 'New', status: 'open' },
    );
    assert.equal(d.changed, true);
    assert.match(d.summary ?? '', /subject “New”/);
  });

  it('reports both when both change', () => {
    const d = diffTicketWatchCaches(
      { subject: 'Old', status: 'open' },
      { subject: 'New', status: 'solved' },
    );
    assert.equal(d.changed, true);
    assert.match(d.summary ?? '', /status open → solved/);
    assert.match(d.summary ?? '', /subject “New”/);
  });
});
