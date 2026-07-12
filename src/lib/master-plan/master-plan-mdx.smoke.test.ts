/**
 * Smoke: live master-plan.mdx inventory after Connections fold.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanTicketStatuses, rollupTicketStatuses } from './ticket-status';
import { buildMasterPlanOutline, ticketToTaskStatus } from './ops-plans-bridge';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MDX = path.join(REPO, 'master-plan.mdx');

test('master-plan.mdx projects 74 CONN tickets into multi-section ops outline', () => {
  const mdx = fs.readFileSync(MDX, 'utf8');
  const tickets = scanTicketStatuses(mdx);
  const conn = tickets.filter((t) => t.ticketId.startsWith('CONN-'));
  assert.equal(conn.length, 74);

  const rollup = rollupTicketStatuses(tickets);
  assert.ok((rollup.pending ?? 0) + (rollup['in-progress'] ?? 0) + (rollup.deployed ?? 0) >= 74);

  const outline = buildMasterPlanOutline(mdx);
  const connSecs = outline.filter((s) => s.tickets.some((t) => t.ticketId.startsWith('CONN-')));
  assert.ok(connSecs.length >= 8, `got ${connSecs.length} CONN sections`);

  // Every CONN ticket maps to a bridge-safe ops status
  for (const t of conn) {
    assert.equal(ticketToTaskStatus(t.status), 'open');
  }

  // Preserve other families
  assert.ok(tickets.some((t) => t.ticketId.startsWith('ALP-')));
  assert.ok(tickets.some((t) => t.ticketId.startsWith('ROI-')));
  assert.ok(tickets.some((t) => t.ticketId.startsWith('WS-')));

  // Index section present for forge navigation
  assert.ok(mdx.includes('Live index'));
  assert.ok(mdx.includes('CONN-*'));
});
