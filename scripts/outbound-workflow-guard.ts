#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  OUTBOUND_WORKFLOW_COHORT_FILES,
  evaluateOutboundWorkflowCohort,
} from '../src/lib/shipping/outbound-workflow-cohort';

const sources = Object.fromEntries(
  Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, file]) => [key, readFileSync(file, 'utf8')]),
) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
const verdict = evaluateOutboundWorkflowCohort(sources);
if (process.argv.includes('--json')) console.log(JSON.stringify(verdict, null, 2));
else console.log(`outbound-workflow-guard: ${verdict.ok ? 'pass' : 'FAIL'} — ${verdict.violations.length} violations`);
process.exit(verdict.ok ? 0 : 1);
