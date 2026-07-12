/**
 * Flip a `<TicketStatus />` in the local master-plan MDX (ALP-2.5 hook).
 *
 *   npx tsx .cycle_forge_ops/scripts/master-plan-set-status.mjs <ticketId> <status> [resolutionCommit]
 *
 * Statuses: pending | in-progress | deployed (contract-enforced; anything else
 * exits 2). Writes the FILE only — the running sync daemon picks the change up
 * via fs.watch and fans it out to the live Operations console over Ably. If the
 * daemon is down the file is still the SoT and syncs on the daemon's next start.
 * Called by forge.sh after a successful VERIFY (see the post-VERIFY hook).
 *
 * After a successful write, optionally POSTs /api/forge/master-plan/sync so
 * ops_plans tables refresh without waiting for a browser viewer
 * (FORGE_INGEST_TOKEN + FORGE_APP_URL or NEXT_PUBLIC_APP_URL).
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const { isTicketStatus, setTicketStatusInMdx } = await import('../../src/lib/master-plan/ticket-status.ts');

const [ticketId, status, resolutionCommit] = process.argv.slice(2);

if (!ticketId || !status) {
  console.error('usage: master-plan-set-status.mjs <ticketId> <status> [resolutionCommit]');
  process.exit(2);
}
if (!isTicketStatus(status)) {
  console.error(`invalid status "${status}" — allowed: pending | in-progress | deployed`);
  process.exit(2);
}

const PLAN_PATH = process.env.MASTER_PLAN_PATH
  ? path.resolve(REPO_ROOT, process.env.MASTER_PLAN_PATH)
  : path.join(REPO_ROOT, 'master-plan.mdx');

const mdx = await fsp.readFile(PLAN_PATH, 'utf8');
const result = setTicketStatusInMdx(mdx, ticketId, status, resolutionCommit ? { resolutionCommit } : undefined);

if (!result.changed) {
  console.error(
    result.previousStatus === null
      ? `ticket "${ticketId}" not found in ${PLAN_PATH}`
      : `ticket "${ticketId}" already "${status}" — no change`,
  );
  process.exit(result.previousStatus === null ? 3 : 0);
}

const tmp = path.join(path.dirname(PLAN_PATH), `.${path.basename(PLAN_PATH)}.tmp-setstatus-${process.pid}`);
await fsp.writeFile(tmp, result.mdx, 'utf8');
await fsp.rename(tmp, PLAN_PATH);
console.log(`${ticketId}: ${result.previousStatus} → ${status}${resolutionCommit ? ` (${resolutionCommit})` : ''}`);

// Push the projection into ops_plans so Operations ▸ Plans is not viewer-dependent.
const token = process.env.FORGE_INGEST_TOKEN;
const appUrl = (process.env.FORGE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
if (token && appUrl) {
  try {
    const res = await fetch(`${appUrl}/api/forge/master-plan/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forge-token': token,
      },
      body: JSON.stringify({ mdx: result.mdx }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[ops-plans sync] ${res.status} ${text.slice(0, 200)}`);
    } else {
      const body = await res.json().catch(() => null);
      console.log(`[ops-plans sync] ok planId=${body?.planId ?? '?'} upserted=${body?.upsertedTasks ?? '?'}`);
    }
  } catch (err) {
    console.warn('[ops-plans sync] skipped:', err instanceof Error ? err.message : err);
  }
} else {
  console.log('[ops-plans sync] skipped — set FORGE_INGEST_TOKEN and FORGE_APP_URL to push Neon tables');
}
