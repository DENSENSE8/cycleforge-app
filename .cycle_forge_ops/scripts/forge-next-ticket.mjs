/**
 * Deterministic next-ticket picker (ALP-4.1).
 *
 *   npx tsx .cycle_forge_ops/scripts/forge-next-ticket.mjs
 *
 * Scans master-plan.mdx for `<TicketStatus status="pending" />` tags in
 * DOCUMENT ORDER and prints the first one as tab-separated
 * `ticketId<TAB>href` (href may be empty). Exits 0 with output when a
 * pending ticket exists; exits 10 silently when the plan has none — the
 * outer loop treats that as "nothing to do".
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const { scanTicketStatuses } = await import('../../src/lib/master-plan/ticket-status.ts');

const PLAN_PATH = process.env.MASTER_PLAN_PATH
  ? path.resolve(REPO_ROOT, process.env.MASTER_PLAN_PATH)
  : path.join(REPO_ROOT, 'master-plan.mdx');

let mdx;
try {
  mdx = await fsp.readFile(PLAN_PATH, 'utf8');
} catch {
  console.error(`master plan not found at ${PLAN_PATH}`);
  process.exit(2);
}

const pending = scanTicketStatuses(mdx).filter((t) => t.status === 'pending');
if (pending.length === 0) process.exit(10);

const next = pending[0];
process.stdout.write(`${next.ticketId}\t${next.href ?? ''}\n`);
