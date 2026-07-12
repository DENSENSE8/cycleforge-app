/**
 * Connections HTML → CONN-* MDX extract (Phase 1 fold).
 * Spawns the extractor script against the live HTML file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanTicketStatuses } from './ticket-status';
import { buildMasterPlanOutline } from './ops-plans-bridge';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HTML = path.join(REPO, 'docs/master-connections-and-refactor/staff-connections-planning.html');
const MDX = path.join(REPO, 'master-plan.mdx');
const SCRIPT = path.join(REPO, 'scripts/extract-connections-mdx.mjs');

test('HTML has 74 unique data-check-id values', () => {
  const html = fs.readFileSync(HTML, 'utf8');
  const ids = [...html.matchAll(/data-check-id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 74);
  assert.equal(new Set(ids).size, 74);
});

test('extractor emits 74 CONN-* TicketStatus tags with valid statuses', () => {
  const out = execFileSync(process.execPath, [SCRIPT], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  // script prints fragment to stdout; stderr has count
  const tickets = scanTicketStatuses(out);
  assert.equal(tickets.length, 74, `expected 74 tickets, got ${tickets.length}`);
  for (const t of tickets) {
    assert.match(t.ticketId, /^CONN-/);
    assert.equal(t.status, 'pending');
    assert.ok(t.href && t.href.startsWith('/docs/'), t.ticketId);
  }
  assert.ok(out.includes('# Connections — Now → Change'));
  assert.ok(out.includes('## Start'));
  assert.ok(out.includes('## Technical'));
});

test('master-plan.mdx contains every CONN ticket and Connections outline sections', () => {
  const mdx = fs.readFileSync(MDX, 'utf8');
  assert.ok(mdx.includes('# Connections — Now → Change'));

  const html = fs.readFileSync(HTML, 'utf8');
  const ids = [...html.matchAll(/data-check-id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    assert.ok(
      mdx.includes(`ticketId="CONN-${id}"`),
      `missing CONN-${id} in master-plan.mdx`,
    );
  }

  const connTickets = scanTicketStatuses(mdx).filter((t) => t.ticketId.startsWith('CONN-'));
  assert.equal(connTickets.length, 74);

  const outline = buildMasterPlanOutline(mdx);
  const connSections = outline.filter((s) =>
    s.tickets.some((t) => t.ticketId.startsWith('CONN-')),
  );
  assert.ok(connSections.length >= 8, `expected multi-section CONN outline, got ${connSections.length}`);
  // ALP tickets still present (fold must not wipe)
  assert.ok(mdx.includes('ticketId="ALP-0.3"'));
  assert.ok(mdx.includes('ticketId="ROI-A1"'));
});

test('extract-connections-mdx --check exits 0 against current master-plan.mdx', () => {
  execFileSync(process.execPath, [SCRIPT, '--check'], {
    cwd: REPO,
    encoding: 'utf8',
  });
});
