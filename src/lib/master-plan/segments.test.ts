import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMasterPlanSegments } from './segments';

const SAMPLE = `{/*
  metadata comment — must not render
*/}

# Plan title

Intro prose.

<TicketStatus status="pending" ticketId="ALP-1.1" href="/docs/x.md" />

## Section

<TicketStatus status="done" ticketId="BAD-1" />
<AgentLog runUid="run-42" stage="verify" />

Tail prose.
`;

test('splits markdown and component tags in document order', () => {
  const segs = parseMasterPlanSegments(SAMPLE);
  assert.deepEqual(
    segs.map((s) => s.kind),
    ['markdown', 'ticket', 'markdown', 'ticket', 'agent-log', 'markdown'],
  );
});

test('strips the MDX comment block from rendered markdown', () => {
  const segs = parseMasterPlanSegments(SAMPLE);
  const md = segs.filter((s) => s.kind === 'markdown').map((s) => (s as { text: string }).text).join('');
  assert.ok(!md.includes('metadata comment'));
  assert.ok(md.includes('# Plan title'));
  assert.ok(md.includes('Tail prose.'));
});

test('ticket segments carry parsed status; invalid statuses surface as null + raw', () => {
  const segs = parseMasterPlanSegments(SAMPLE);
  const tickets = segs.filter((s) => s.kind === 'ticket') as Array<{
    ticketId: string;
    status: string | null;
    rawStatus: string;
    href?: string;
  }>;
  assert.equal(tickets[0].ticketId, 'ALP-1.1');
  assert.equal(tickets[0].status, 'pending');
  assert.equal(tickets[0].href, '/docs/x.md');
  assert.equal(tickets[1].ticketId, 'BAD-1');
  assert.equal(tickets[1].status, null);
  assert.equal(tickets[1].rawStatus, 'done');
});

test('agent-log segments parse runUid + stage; empty doc → no segments', () => {
  const segs = parseMasterPlanSegments(SAMPLE);
  const log = segs.find((s) => s.kind === 'agent-log') as { runUid: string; stage?: string };
  assert.equal(log.runUid, 'run-42');
  assert.equal(log.stage, 'verify');
  assert.deepEqual(parseMasterPlanSegments(''), []);
  assert.deepEqual(parseMasterPlanSegments('{/* only a comment */}'), []);
});
