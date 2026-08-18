/**
 * Ticket vs Timeline split — station Ticket Displays are messages-only;
 * warehouse/carrier spine lives on the peer Timeline Displays tab.
 *
 * Support service workspace may still opt into `mergeFloorTimeline`.
 *
 * Run: `npx tsx --test src/components/support/zendesk/chat/ticket-timeline-split.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

describe('Ticket vs Timeline Displays split', () => {
  const detail = read('src/components/support/zendesk/chat/SupportTicketDetail.tsx');
  const unboxTicket = read(
    'src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx',
  );
  const testingDisplays = read('src/components/tech/testing-panel/build-testing-displays.tsx');
  const pack = read('src/components/packer/PackOrderPanel.tsx');
  const supportFocus = read(
    'src/components/support/service-workspace/SupportTicketFocus.tsx',
  );

  it('SupportTicketDetail defaults to messages-only; floor events are gated', () => {
    assert.match(detail, /mergeFloorTimeline\s*=\s*false/);
    assert.match(
      detail,
      /events=\{mergeFloorTimeline \? contextBundle\?\.timeline : undefined\}/,
    );
  });

  it('Unbox · Testing Ticket Displays pin mergeFloorTimeline false', () => {
    assert.match(unboxTicket, /mergeFloorTimeline=\{false\}/);
    // Testing reuses TicketDisplayHost (Unbox grain) — same messages-only pin.
    assert.match(testingDisplays, /TicketDisplayHost/);
    // Pack Displays are Photos · Timeline · Listings only (no Ticket leaf) —
    // see pack-display-index.ts. Do not require mergeFloorTimeline on Pack.
    assert.doesNotMatch(
      pack,
      /SupportTicketDetail|TicketDisplayHost/,
      'Pack must not mount a Ticket Displays leaf',
    );
  });

  it('Support Ticket focus may opt into floor merge (no peer Timeline Displays yet)', () => {
    assert.match(supportFocus, /mergeFloorTimeline\b/);
    assert.doesNotMatch(supportFocus, /mergeFloorTimeline=\{false\}/);
  });

  it('Testing keeps a peer Timeline Displays tab', () => {
    assert.match(testingDisplays, /id:\s*['"]timeline['"]/);
    assert.match(testingDisplays, /WorkspaceTimelineTab/);
  });
});
