import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TICKET_STATUSES,
  isTicketStatus,
  parseTicketStatus,
  scanTicketStatuses,
  setTicketStatusInMdx,
  rollupTicketStatuses,
} from './ticket-status';

const SAMPLE = `# Master plan

Some intro prose.

<TicketStatus status="pending" ticketId="ALP-1.1" href="/docs/todo/agentic-loop-master-plan.md" />

## Section

<TicketStatus status="in-progress" ticketId="P1-TRACE-02" href="/docs/todo/trace.md" />
<TicketStatus status="deployed" ticketId="ALP-0.2" resolutionCommit="abc1234" />
<TicketStatus status="done" ticketId="BAD-1" />

<AgentLog runUid="run-1" stage="verify" />
`;

test('enum is exactly the three locked statuses', () => {
  assert.deepEqual([...TICKET_STATUSES], ['pending', 'in-progress', 'deployed']);
});

test('isTicketStatus / parseTicketStatus reject out-of-enum values', () => {
  assert.equal(isTicketStatus('pending'), true);
  assert.equal(isTicketStatus('in-progress'), true);
  assert.equal(isTicketStatus('deployed'), true);
  for (const bad of ['done', 'todo', 'review', 'blocked', 'PENDING', '', null, undefined, 3]) {
    assert.equal(isTicketStatus(bad), false, `should reject ${JSON.stringify(bad)}`);
    assert.equal(parseTicketStatus(bad), null);
  }
});

test('scanTicketStatuses finds every tag with spans and flags invalid statuses', () => {
  const tickets = scanTicketStatuses(SAMPLE);
  assert.equal(tickets.length, 4);

  const byId = Object.fromEntries(tickets.map((t) => [t.ticketId, t]));
  assert.equal(byId['ALP-1.1'].status, 'pending');
  assert.equal(byId['ALP-1.1'].href, '/docs/todo/agentic-loop-master-plan.md');
  assert.equal(byId['P1-TRACE-02'].status, 'in-progress');
  assert.equal(byId['ALP-0.2'].status, 'deployed');
  assert.equal(byId['ALP-0.2'].resolutionCommit, 'abc1234');
  // Invalid status is surfaced, not hidden or coerced.
  assert.equal(byId['BAD-1'].status, null);
  assert.equal(byId['BAD-1'].rawStatus, 'done');

  for (const t of tickets) {
    assert.equal(SAMPLE.slice(t.start, t.end), t.raw);
  }
});

test('scanTicketStatuses skips tags without a ticketId and handles empty docs', () => {
  assert.deepEqual(scanTicketStatuses(''), []);
  assert.deepEqual(scanTicketStatuses('<TicketStatus status="pending" />'), []);
});

test('setTicketStatusInMdx flips a status in place and preserves other tags', () => {
  const { mdx, changed, previousStatus } = setTicketStatusInMdx(SAMPLE, 'ALP-1.1', 'deployed', {
    resolutionCommit: 'fff9999',
  });
  assert.equal(changed, true);
  assert.equal(previousStatus, 'pending');
  const tickets = scanTicketStatuses(mdx);
  const byId = Object.fromEntries(tickets.map((t) => [t.ticketId, t]));
  assert.equal(byId['ALP-1.1'].status, 'deployed');
  assert.equal(byId['ALP-1.1'].resolutionCommit, 'fff9999');
  assert.equal(byId['ALP-1.1'].href, '/docs/todo/agentic-loop-master-plan.md');
  // Untouched neighbours survive byte-for-byte.
  assert.equal(byId['P1-TRACE-02'].status, 'in-progress');
  assert.equal(byId['ALP-0.2'].resolutionCommit, 'abc1234');
  assert.ok(mdx.includes('<AgentLog runUid="run-1" stage="verify" />'));
});

test('setTicketStatusInMdx drops resolutionCommit when leaving deployed', () => {
  const { mdx } = setTicketStatusInMdx(SAMPLE, 'ALP-0.2', 'in-progress');
  const t = scanTicketStatuses(mdx).find((x) => x.ticketId === 'ALP-0.2');
  assert.equal(t?.status, 'in-progress');
  assert.equal(t?.resolutionCommit, undefined);
});

test('setTicketStatusInMdx is a no-op for unknown tickets', () => {
  const res = setTicketStatusInMdx(SAMPLE, 'NOPE-1', 'deployed');
  assert.equal(res.changed, false);
  assert.equal(res.previousStatus, null);
  assert.equal(res.mdx, SAMPLE);
});

test('rollupTicketStatuses counts per status incl. invalid', () => {
  const rollup = rollupTicketStatuses(scanTicketStatuses(SAMPLE));
  assert.deepEqual(rollup, { total: 4, pending: 1, inProgress: 1, deployed: 1, invalid: 1 });
});
