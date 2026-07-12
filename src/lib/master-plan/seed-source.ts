/**
 * Canonical seed source for empty-doc bootstrap (ALP-1.4).
 *
 * Every seeder (web client via GET /api/forge/master-plan/seed, sync daemon
 * reading the file directly) MUST bootstrap from the SAME string so the
 * fixed-clientID seed updates stay byte-identical and the seeding race is
 * idempotent (see doc.ts / README.md). SoT is the repo-root master-plan.mdx;
 * the inline fallback only covers deploys where the file wasn't traced.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const MASTER_PLAN_FILE_BASENAME = 'master-plan.mdx';

/** Minimal, valid starter used only when the repo file is unreadable. */
export const MASTER_PLAN_FALLBACK_MDX = `# Cycle Forge — Agentic Loop Master Plan

**Legend** — statuses: \`pending\` · \`in-progress\` · \`deployed\` (contract:
src/lib/master-plan/ticket-status.ts).

<TicketStatus status="pending" ticketId="ALP-1.1" href="/docs/todo/agentic-loop-master-plan.md" />
`;

export interface MasterPlanSeedDeps {
  readFileFn: (p: string, enc: 'utf8') => Promise<string>;
  cwd: () => string;
  env: Record<string, string | undefined>;
}

const defaultDeps: MasterPlanSeedDeps = {
  readFileFn: (p, enc) => readFile(p, enc),
  cwd: () => process.cwd(),
  env: process.env,
};

export function masterPlanFilePath(deps: MasterPlanSeedDeps = defaultDeps): string {
  const configured = deps.env.MASTER_PLAN_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.join(deps.cwd(), configured);
  return path.join(deps.cwd(), MASTER_PLAN_FILE_BASENAME);
}

export interface MasterPlanSeed {
  mdx: string;
  /** 'file' when read from the tracked MDX; 'fallback' when unreadable. */
  source: 'file' | 'fallback';
}

export async function readMasterPlanSeed(deps: MasterPlanSeedDeps = defaultDeps): Promise<MasterPlanSeed> {
  try {
    const mdx = await deps.readFileFn(masterPlanFilePath(deps), 'utf8');
    if (mdx.trim().length > 0) return { mdx, source: 'file' };
  } catch {
    // fall through to the fallback
  }
  return { mdx: MASTER_PLAN_FALLBACK_MDX, source: 'fallback' };
}
