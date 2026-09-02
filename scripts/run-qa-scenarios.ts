#!/usr/bin/env tsx
/**
 * CI / operator entry for named QA scenarios.
 *
 *   pnpm test:qa-scenarios           # deterministic, no secrets
 *   pnpm test:qa-scenarios -- --org  # QA tenant (DATABASE_URL + provisioned org)
 *
 * Exit 1 if any scenario failed. Blocked/skipped required items are reported
 * but only `--org` treats blocked required as a red gate.
 */

import { QA_ORG_ID } from '@/lib/tenancy/qa-org';
import { runScenarioSuite } from '@/lib/qa/scenarios/run';

const wantOrg = process.argv.includes('--org');
const suite = wantOrg ? 'qa-org' : 'deterministic';

async function main() {
  const orgId = wantOrg ? QA_ORG_ID : undefined;
  const report = await runScenarioSuite({
    suite,
    orgId,
    persist: false,
  });

  console.log(`\nQA scenarios (${suite})`);
  console.log(`  passed ${report.passed}  failed ${report.failed}  skipped ${report.skipped}  blocked ${report.blocked}`);
  for (const r of report.results) {
    const mark =
      r.status === 'passed' ? '✓'
        : r.status === 'failed' ? '✗'
          : r.status === 'blocked' ? '■'
            : '·';
    console.log(`  ${mark} ${r.scenarioId}  ${r.status}  ${r.detail}`);
    if (r.playwrightCommand) console.log(`      Playwright: ${r.playwrightCommand}`);
  }
  if (report.missingRequired.length) {
    console.log(`\n  Release blockers: ${report.missingRequired.join(', ')}`);
  }
  console.log(`  readyForRelease: ${report.readyForRelease ? 'yes' : 'no'}\n`);

  if (report.failed > 0) process.exit(1);
  if (wantOrg && report.missingRequired.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
