/**
 * Connections right-rail display: flush squared bands + provider-id fallback.
 * Source guard — no render harness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const displays = readFileSync(
  join(here, '../service-workspace/support-ticket-displays.tsx'),
  'utf8',
);
const hub = readFileSync(join(here, 'SupportContextHub.tsx'), 'utf8');
const strip = readFileSync(join(here, 'LinkageStrip.tsx'), 'utf8');
const panel = readFileSync(join(here, '../../linkage/LinkedTicketsPanel.tsx'), 'utf8');
const detail = readFileSync(join(here, 'SupportContextDetailPanel.tsx'), 'utf8');

test('Connections content uses gap-0 bands, not stack-row detachment', () => {
  // Connections tab content only — Assigned + hub must be flush, not stack-row.
  const connectionsBlock = displays.match(
    /id:\s*['"]connections['"][\s\S]*?id:\s*['"]conversations['"]/,
  );
  assert.ok(connectionsBlock, 'expected Connections display block');
  assert.match(connectionsBlock[0], /flex flex-col gap-0/);
  assert.doesNotMatch(connectionsBlock[0], /stack-row/);
  assert.match(connectionsBlock[0], /border-b border-border-hairline/);
  assert.match(connectionsBlock[0], /surface="flush"/);
});

test('SupportContextHub flush strip drops card-body padding and passes surface', () => {
  assert.match(hub, /stripPadClass/);
  assert.match(hub, /surface=\{surface\}/);
  // Flush path must not keep the classic pt-3/pt-4 strip pad.
  assert.match(
    hub,
    /const stripPadClass = flush\s*\?\s*undefined/,
  );
});

test('LinkageStrip flush layout + LinkedTicketsPanel surface plumbing', () => {
  assert.match(strip, /surface\?:\s*'card'\s*\|\s*'flush'/);
  assert.match(strip, /surface=\{surface\}/);
  assert.match(strip, /resolveLinkageProviderTicketId/);
  assert.match(panel, /surface\?:\s*'card'\s*\|\s*'flush'/);
  // Flush empty keeps Linkage eyebrow + plain caption (not silent null).
  assert.match(panel, /No linked order or tracking yet\./);
  assert.match(panel, /if \(!enabled\) \{[\s\S]*?if \(!flush/);
  // Flush resolved-empty path is a plain caption, not the card island markup.
  assert.match(
    panel,
    /const emptyLoop = flush \? \(\s*<p className="text-role-caption text-text-faint">No linked order found\.<\/p>/,
  );
});

test('SupportContextDetailPanel uses DeskInspectorIndexShell (no icon strip)', () => {
  assert.match(detail, /DeskInspectorIndexShell/);
  assert.doesNotMatch(detail, /SectionTabsSlider/);
  assert.doesNotMatch(detail, /StationDisplaysPushStack/);
  assert.doesNotMatch(detail, /className="p-2"/);
});
