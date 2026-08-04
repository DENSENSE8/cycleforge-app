import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterPlanOutline } from '@/lib/master-plan/outline';

const MDX = `# Master plan

## Loop bring-up (ALP)

<TicketStatus status="deployed" ticketId="ALP-0.3" />
<TicketStatus status="in-progress" ticketId="ALP-1.1" />

## Product roadmap tickets

<TicketStatus status="pending" ticketId="P1-TRACE-02" />
`;

test('buildMasterPlanOutline groups tickets under their ## heading', () => {
  const outline = buildMasterPlanOutline(MDX);
  assert.deepEqual(
    outline.map((s) => [s.heading, s.tickets.map((t) => t.ticketId)]),
    [
      ['Loop bring-up (ALP)', ['ALP-0.3', 'ALP-1.1']],
      ['Product roadmap tickets', ['P1-TRACE-02']],
    ],
  );
});

test('buildMasterPlanOutline falls back to Plan when no ## heading precedes a ticket', () => {
  const outline = buildMasterPlanOutline(
    '<TicketStatus status="pending" ticketId="X-1" />',
  );
  assert.equal(outline[0]!.heading, 'Plan');
  assert.equal(outline[0]!.tickets[0]!.ticketId, 'X-1');
});
