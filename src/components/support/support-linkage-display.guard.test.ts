import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const HEADER = source('./zendesk/chat/SupportChatHeader.tsx');
const LINKAGE_STRIP = source('./context/LinkageStrip.tsx');
const LINKAGE_PANEL = source('../linkage/LinkedTicketsPanel.tsx');
const COPY_CHIP = source('../ui/CopyChip.tsx');

test('Support header uses one icon-only context action without a tracking shortcut', () => {
  assert.equal(HEADER.includes('+ TRK#'), false);
  assert.equal(HEADER.includes('trackingLinkTicketId'), false);
  assert.match(HEADER, /<IconButton[\s\S]*?ariaLabel="Support context"/);
});

test('Support linkage displays tracking by its last four characters', () => {
  assert.match(LINKAGE_STRIP, /<LinkedTicketsPanel[\s\S]*?hideTickets/);
  assert.match(LINKAGE_PANEL, /display=\{last4\(t\.tracking\)\}/);
  assert.match(COPY_CHIP, /display=\{resolveChipDisplay\(getLast4\(value\)\)\}/);
});
