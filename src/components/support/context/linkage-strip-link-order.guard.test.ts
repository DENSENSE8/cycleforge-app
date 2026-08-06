/**
 * Connections LinkageStrip must expose "Link order" for ticket → Ecwid pairing
 * (walk-in / phone orders with no STN). Source guard — no render harness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const strip = readFileSync(join(here, 'LinkageStrip.tsx'), 'utf8');
const popover = readFileSync(
  join(here, '../link/TicketOrderLinkPopover.tsx'),
  'utf8',
);

test('LinkageStrip composes TicketOrderLinkPopover and a Link order chip', () => {
  assert.match(strip, /TicketOrderLinkPopover/);
  assert.match(strip, /label="Link order"/);
  assert.match(strip, /canLinkOrder/);
});

test('LinkageStrip enables link actions from resolved provider id, not only registry ticket', () => {
  assert.match(strip, /resolveLinkageProviderTicketId/);
  assert.match(strip, /providerTicketId != null/);
  // Must not gate canLink* solely on ticket?.providerTicketId (registry miss).
  assert.doesNotMatch(
    strip,
    /canLinkTracking = Boolean\(\s*canZendesk && ticket\?\.providerTicketId/,
  );
  assert.doesNotMatch(
    strip,
    /canLinkOrder = Boolean\(\s*canZendesk && ticket\?\.providerTicketId/,
  );
});

test('TicketOrderLinkPopover posts order anchors through the link waist', () => {
  assert.match(popover, /\/api\/orders\/lookup\//);
  assert.match(popover, /\/api\/support\/tickets\/link/);
  assert.match(popover, /type:\s*['"]order['"]/);
  assert.match(popover, /orderId/);
});
