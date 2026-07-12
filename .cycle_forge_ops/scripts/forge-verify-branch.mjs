/**
 * Neon verify-branch lifecycle for forge.sh (ALP-4.2/4.3/4.4).
 *
 *   create:  npx tsx forge-verify-branch.mjs create <runUid>
 *            → prints `BRANCH_ID=…` and `BRANCH_DATABASE_URL=…` on stdout
 *   delete:  npx tsx forge-verify-branch.mjs delete <branchId>
 *   sweep:   npx tsx forge-verify-branch.mjs sweep [ttlMinutes]
 *
 * Uses src/lib/neon/branches.ts (Deps-injected client). The client's
 * assertNotProductionUrl guard runs on every minted URL — a branch URL that
 * resolves to the production host aborts the run before any test executes.
 * Requires NEON_API_KEY + NEON_PROJECT_ID (+ DATABASE_URL as the guard
 * baseline) in the environment / repo .env.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const { createVerifyBranch, deleteBranch, sweepExpiredVerifyBranches } = await import('../../src/lib/neon/branches.ts');

const [command, arg] = process.argv.slice(2);

try {
  if (command === 'create') {
    if (!arg) throw new Error('usage: forge-verify-branch.mjs create <runUid>');
    const branch = await createVerifyBranch(arg);
    // Shell-parsable output — forge.sh evals these two lines.
    process.stdout.write(`BRANCH_ID=${branch.branchId}\n`);
    process.stdout.write(`BRANCH_DATABASE_URL=${branch.connectionUri}\n`);
  } else if (command === 'delete') {
    if (!arg) throw new Error('usage: forge-verify-branch.mjs delete <branchId>');
    await deleteBranch(arg);
    console.error(`deleted verify branch ${arg}`);
  } else if (command === 'sweep') {
    // A non-numeric TTL arg (e.g. `sweep 12h`) is ignored, not silently treated
    // as 0 → the lib clamps NaN to the default TTL rather than a no-op sweep.
    const ttl = arg != null && Number.isFinite(Number(arg)) ? Number(arg) : undefined;
    const deleted = await sweepExpiredVerifyBranches(ttl);
    console.error(deleted.length ? `swept: ${deleted.join(', ')}` : 'nothing to sweep');
  } else {
    throw new Error('usage: forge-verify-branch.mjs <create|delete|sweep> [arg]');
  }
} catch (err) {
  console.error(`[verify-branch] ${err?.message ?? err}`);
  process.exit(1);
}
